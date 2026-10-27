const jwt = require('jsonwebtoken');

const { jwtSecret } = require('../config');

module.exports = (req, res, next) => {
  const authHeader = req.get('Authorization');
  if (!authHeader) {
    const error = new Error('Not authenticated.');
    error.statusCode = 401;
    throw error;
  }
  const token = authHeader.split(' ')[1];
  let decodedToken;
  try {
    decodedToken = jwt.verify(token, jwtSecret(), {
      algorithms: ['HS256']
    });
    if (decodedToken.purpose === 'live') {
      const error = new Error('Not authenticated.');
      error.statusCode = 401;
      throw error;
    }
  } catch (err) {
    const error = new Error('Not authenticated.');
    error.statusCode = 401;
    throw error;
  }
  if (!decodedToken) {
    const error = new Error('Not authenticated.');
    error.statusCode = 401;
    throw error;
  }
  req.userId = decodedToken.userId;
  next();
};
