const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 5000;

app.use(express.json());
app.use(cors());
app.options('/automate', cors());

const fetchProxyList = async () => {
    try {
        const response = await axios.get('https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all');
        return response.data.split('\r\n');
    } catch (error) {
        console.error('Error fetching proxy list:', error);
        return [];
    }
};

const rotateIP = async (page, proxyList) => {
    try {
        if (proxyList.length === 0) {
            throw new Error('No proxies available.');
        }

        const randomProxy = proxyList[Math.floor(Math.random() * proxyList.length)];

        const proxy = {
            server: randomProxy.split(':')[0],
            port: parseInt(randomProxy.split(':')[1], 10) || 80,
        };
        await page.setExtraHTTPHeaders({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
        });

        await page.setRequestInterception(false);
        await page.setRequestInterception(true);

        page.on('request', (request) => {
            request.continue({ proxy });
        });

        console.log(`Using proxy: ${randomProxy}`);
    } catch (error) {
        console.error('Error rotating IP:', error);
    }
};

const downloadFile = async (url, folderPath) => {
    try {
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
        });

        const contentDisposition = response.headers['content-disposition'];
        const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
        const matches = filenameRegex.exec(contentDisposition);

        let filename = 'downloadedFile';
        if (matches != null && matches[1]) {
            filename = matches[1].replace(/['"]/g, '');
        }

        const timestamp = new Date().getTime();
        filename = `${filename}_${timestamp}.pdf`;

        const filePath = path.join(folderPath, filename);
        const fileStream = fs.createWriteStream(filePath);

        response.data.pipe(fileStream);

        return new Promise((resolve, reject) => {
            fileStream.on('finish', () => resolve(filePath));
            fileStream.on('error', (error) => reject(error));
        });
    } catch (error) {
        console.error('Error downloading file:', error);
        throw error;
    }

};

app.post('/automate', async (req, res) => {
    const { urls } = req.body;
    try {
        const proxyList = await fetchProxyList();

        if (proxyList.length === 0) {
            throw new Error('Unable to fetch a valid proxy list.');
        }

        const browser = await puppeteer.launch({ headless: true });
        const context = await browser.createIncognitoBrowserContext();
        const page = await context.newPage();

        await rotateIP(page, proxyList);

        for (const url of urls) {
            console.log(proxyList);
            console.log(`Navigating to: ${url}`);
            await page.goto(url, { timeout: 60000 });

            console.log('Waiting for the PDF link to be visible...');
            const pdfLink = await page.waitForSelector('ul.value.galleys_links li a.obj_galley_link.pdf', { visible: true });

            const pdfHref = await pdfLink.evaluate(link => link.getAttribute('href'));

            console.log(`Clicking on the PDF link: ${pdfHref}`);
            await page.goto(pdfHref);

            console.log('Waiting for the Download link to be visible...');
            const downloadLink = await page.waitForSelector('header.header_view a.download', { visible: true });

            const downloadHref = await downloadLink.evaluate(link => link.getAttribute('href'));

            console.log(`Downloading from: ${downloadHref}`);
            const filePath = 'C:/Users/Casper/OneDrive/Masaüstü/TestforArticle';

            await downloadFile(downloadHref, filePath);

            console.log('Download complete!');
        }

        await context.close();
        await browser.close();

        console.log('Automation successful for all URLs');
        res.status(200).json({ success: true, message: 'Automation successful for all URLs' });
    } catch (error) {
        console.error('Error automating browser:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
