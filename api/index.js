const { handleRequest } = require("../server/server");

module.exports = function handler(req, res) {
  return handleRequest(req, res);
};
