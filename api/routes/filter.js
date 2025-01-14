const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');
const csv = require('csv-parser');
const { Parser } = require('json2csv');
const { Readable } = require('stream');

router.post('/', async (req, res) => {
    // ...existing code...
});

module.exports = router;
