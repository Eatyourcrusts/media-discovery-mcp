module.exports = (req, res) => {
  res.json({ 
    status: 'MCP Server Running on Vercel',
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    success: true
  });
};
