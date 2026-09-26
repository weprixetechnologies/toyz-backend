const bunnyConfig = require('../config/bunnycdn');

class StorageService {
  /**
   * Generates a local proxy upload URL and final CDN file URL for client uploads.
   * @param {string} key - File path/name in the storage zone
   * @param {string} contentType - MIME type of the file
   * @returns {{ uploadUrl: string, fileUrl: string }}
   */
  static getPresignedUploadUrl(key, contentType) {
    const uploadUrl = `/api/v1/storage/upload?key=${encodeURIComponent(key)}&contentType=${encodeURIComponent(contentType)}`;
    const fileUrl = `${bunnyConfig.pullZoneUrl}/${key}`;

    return {
      uploadUrl,
      fileUrl
    };
  }

  /**
   * Uploads raw binary buffer to Bunny.net Storage.
   * @param {string} key - Destination path in Bunny storage
   * @param {Buffer} buffer - File content buffer
   * @param {string} contentType - File MIME type
   * @returns {Promise<string>} Final public pull zone URL
   */
  static async uploadToBunny(key, buffer, contentType) {
    const url = `https://${bunnyConfig.storageRegion}/${bunnyConfig.storageZone}/${key}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'AccessKey': bunnyConfig.apiKey,
        'Content-Type': contentType || 'application/octet-stream'
      },
      body: buffer
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Bunny.net upload failed: Status ${response.status} ${errText || response.statusText}`);
    }

    return `${bunnyConfig.pullZoneUrl}/${key}`;
  }
}

module.exports = StorageService;
