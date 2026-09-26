function errorHandler(err, req, res, next) {
  console.error('[API Error]:', err.stack || err.message || err);

  const statusCode = err.statusCode || res.statusCode !== 200 ? res.statusCode : 500;
  const responseStatus = statusCode >= 400 && statusCode < 600 ? statusCode : 500;

  res.status(responseStatus).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

module.exports = errorHandler;
