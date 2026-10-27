const path = require('path');

const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const rateLimit = require('express-rate-limit');

const { frontOrigins, mongoUri, port, uploadDir } = require('./config');
const feedRoutes = require('./routes/feed');
const authRoutes = require('./routes/auth');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir());
  },
  filename: (req, file, cb) => {
    const safeName = path
      .basename(file.originalname)
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, new Date().toISOString().replace(/:/g, '-') + '-' + safeName);
  }
});

const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();
  const typeOk =
    file.mimetype === 'image/png' ||
    file.mimetype === 'image/jpg' ||
    file.mimetype === 'image/jpeg';
  const nameOk = extension === '.png' || extension === '.jpg' || extension === '.jpeg';
  cb(null, typeOk && nameOk);
};

function limiter(limit, windowMs) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false },
    handler: (req, res) => {
      res.status(429).json({ message: 'Too many attempts. Wait a few minutes and try again.' });
    }
  });
}

app.use(express.json({ limit: '32kb' }));
app.use(
  multer({
    storage: fileStorage,
    fileFilter: fileFilter,
    limits: { fileSize: 1 * 1024 * 1024, files: 1, fields: 8, fieldSize: 16 * 1024 }
  }).single('image')
);
app.use(
  '/images',
  express.static(uploadDir(), {
    dotfiles: 'deny',
    index: false,
    maxAge: '7d'
  })
);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && frontOrigins().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.get('/health', limiter(60, 60 * 1000), (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(200).json({ ok: true, ready });
});

app.use(limiter(300, 15 * 60 * 1000));
app.use('/feed', feedRoutes);
app.use('/auth', authRoutes);

app.use((error, req, res, next) => {
  if (
    error.type === 'entity.parse.failed' ||
    error.type === 'entity.too.large'
  ) {
    return res.status(400).json({ message: 'The request could not be read.' });
  }
  if (
    error.code === 'LIMIT_FILE_SIZE' ||
    error.code === 'LIMIT_FILE_COUNT' ||
    error.code === 'LIMIT_FIELD_VALUE' ||
    error.code === 'LIMIT_UNEXPECTED_FILE'
  ) {
    return res.status(422).json({ message: 'Use a PNG or JPEG no larger than 1 MB.' });
  }
  const status = error.statusCode || 500;
  if (status >= 500) {
    console.error('Request failed');
    return res.status(500).json({ message: 'Something went wrong.' });
  }
  res.status(status).json({ message: error.message, data: error.data });
});

mongoose
  .connect(mongoUri())
  .then(() => {
    console.log('Connected to MongoDB');
    const server = app.listen(port(), '0.0.0.0');
    const io = require('./socket').init(server);
    io.on('connection', () => {
      console.log('Client connected');
    });
  })
  .catch(() => {
    console.error('Could not connect to the database.');
    process.exit(1);
  });
