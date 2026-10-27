const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const { frontOrigins, jwtSecret } = require('./config');

let io;

function originAllowed(origin) {
  if (!origin) return process.env.NODE_ENV !== 'production';
  return frontOrigins().includes(origin);
}

module.exports = {
  init: httpServer => {
    io = new Server(httpServer, {
      cors: {
        origin(origin, callback) {
          if (originAllowed(origin)) callback(null, true);
          else callback(new Error('Origin not allowed'));
        },
        methods: ['GET', 'POST']
      }
    });

    io.use((socket, next) => {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      try {
        const decoded = jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] });
        if (!decoded || decoded.purpose !== 'live' || !decoded.userId) {
          const error = new Error('Not authenticated.');
          return next(error);
        }
        socket.userId = decoded.userId;
        next();
      } catch (err) {
        next(new Error('Not authenticated.'));
      }
    });

    return io;
  },
  getIO: () => {
    if (!io) {
      throw new Error('Socket.io not initialized!');
    }
    return io;
  }
};
