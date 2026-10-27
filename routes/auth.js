const express = require('express');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');

const User = require('../models/user');
const authController = require('../controllers/auth');
const isAuth = require('../middleware/is-auth');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  handler: (req, res) => {
    res.status(429).json({ message: 'Too many attempts. Wait a few minutes and try again.' });
  }
});

const router = express.Router();

router.put(
  '/signup',
  authLimiter,
  [
    body('email')
      .isEmail()
      .withMessage('Please enter a valid email.')
      .custom((value, { req }) => {
        return User.findOne({ email: value }).then(userDoc => {
          if (userDoc) {
            return Promise.reject('E-Mail address already exists!');
          }
        });
      })
      .normalizeEmail(),
    body('password')
      .trim()
      .isLength({ min: 8, max: 72 })
      .withMessage('Use 8–72 characters.'),
    body('firstName')
      .trim()
      .notEmpty()
      .withMessage('Enter your first name.')
      .isLength({ max: 80 })
      .withMessage('Keep your first name under 80 characters.'),
    body('lastName')
      .trim()
      .notEmpty()
      .withMessage('Enter your last name.')
      .isLength({ max: 80 })
      .withMessage('Keep your last name under 80 characters.')
  ],
  authController.signup
);

router.post('/login', authLimiter, authController.login);

router.get('/user', isAuth, authController.getUser);

router.post('/live-ticket', isAuth, authController.liveTicket);

router.patch(
  '/user',
  isAuth,
  [
    body('firstName')
      .trim()
      .notEmpty()
      .withMessage('Enter your first name.')
      .isLength({ max: 80 })
      .withMessage('Keep your first name under 80 characters.'),
    body('lastName')
      .trim()
      .notEmpty()
      .withMessage('Enter your last name.')
      .isLength({ max: 80 })
      .withMessage('Keep your last name under 80 characters.'),
    body('email')
      .isEmail()
      .withMessage('Enter a valid email.')
      .normalizeEmail()
      .custom((value, { req }) => {
        return User.findOne({ email: value }).then(userDoc => {
          if (userDoc && userDoc._id.toString() !== req.userId) {
            return Promise.reject('That email is already in use.');
          }
        });
      }),
    body('status')
      .trim()
      .notEmpty()
      .withMessage('Status cannot be empty.')
      .isLength({ max: 140 })
      .withMessage('Keep the status under 140 characters.'),
    body('password')
      .optional({ values: 'falsy' })
      .trim()
      .isLength({ min: 8, max: 72 })
      .withMessage('Use 8–72 characters.')
  ],
  authController.updateUser
);

router.get('/status', isAuth, authController.getUserStatus);

router.patch(
  '/status',
  isAuth,
  [
    body('status')
      .trim()
      .notEmpty()
  ],
  authController.updateUserStatus
);

module.exports = router;
