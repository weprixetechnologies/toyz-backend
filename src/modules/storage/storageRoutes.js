const express = require('express');
const router = express.Router();
const storageController = require('./storageController');

router.post('/upload', storageController.generateUploadUrl);
router.put('/upload', storageController.handleUpload);

module.exports = router;
