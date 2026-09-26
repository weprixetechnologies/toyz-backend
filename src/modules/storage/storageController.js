const StorageService = require('../../utils/bunnyUpload');

// GET or POST to generate presigned URL (we will support POST since frontend does adminApi.post)
exports.generateUploadUrl = (req, res) => {
  const { key, contentType } = req.query;
  if (!key) return res.status(400).json({ success: false, message: 'Key is required' });

  try {
    const urls = StorageService.getPresignedUploadUrl(key, contentType);
    res.json({ success: true, data: urls });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT to actually proxy the upload to Bunny
exports.handleUpload = async (req, res) => {
  const { key, contentType } = req.query;
  if (!key) return res.status(400).json({ success: false, message: 'Key is required' });

  try {
    // Collect the stream into a buffer
    const chunks = [];
    for await (let chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    const fileUrl = await StorageService.uploadToBunny(key, buffer, contentType);
    res.json({ success: true, data: { fileUrl } });
  } catch (err) {
    console.error('Storage Proxy Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};
