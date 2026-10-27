const { validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { jwtSecret } = require('../config');
const User = require('../models/user');

const DUMMY_PASSWORD_HASH = bcrypt.hashSync('vellum-timing-pad', 10);

function presentName(user) {
  let firstName = user.firstName;
  let lastName = user.lastName;
  if (!firstName || !lastName) {
    const parts = String(user.name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!firstName) firstName = parts.shift() || 'Member';
    if (!lastName) lastName = parts.join(' ') || 'Member';
  }
  return { firstName, lastName };
}

exports.signup = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error('Validation failed.');
    error.statusCode = 422;
    error.data = errors.array();
    throw error;
  }
  const email = req.body.email;
  const firstName = req.body.firstName;
  const lastName = req.body.lastName;
  const password = req.body.password;
  try {
    const hashedPw = await bcrypt.hash(password, 12);

    const user = new User({
      email: email,
      password: hashedPw,
      firstName: firstName,
      lastName: lastName
    });
    const result = await user.save();
    res.status(201).json({ message: 'User created!', userId: result._id });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.login = async (req, res, next) => {
  const email = typeof req.body.email === 'string' ? req.body.email : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  let loadedUser;
  try {
    const user = await User.findOne({ email: email });
    loadedUser = user;
    const isEqual = await bcrypt.compare(password, user ? user.password : DUMMY_PASSWORD_HASH);
    if (!user || !isEqual) {
      const error = new Error('Email or password does not match.');
      error.statusCode = 401;
      throw error;
    }
    const token = jwt.sign(
      {
        email: loadedUser.email,
        userId: loadedUser._id.toString()
      },
      jwtSecret(),
      { expiresIn: '1h', algorithm: 'HS256' }
    );
    res.status(200).json({ token: token, userId: loadedUser._id.toString() });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select('firstName lastName name email status');
    if (!user) {
      const error = new Error('User not found.');
      error.statusCode = 404;
      throw error;
    }
    const names = presentName(user);
    res.status(200).json({
      user: {
        id: user._id.toString(),
        firstName: names.firstName,
        lastName: names.lastName,
        email: user.email,
        status: user.status
      }
    });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.updateUser = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error('Validation failed.');
    error.statusCode = 422;
    error.data = errors.array();
    throw error;
  }

  const nextPassword = typeof req.body.password === 'string' ? req.body.password.trim() : '';
  const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';

  try {
    const user = await User.findById(req.userId);
    if (!user) {
      const error = new Error('User not found.');
      error.statusCode = 404;
      throw error;
    }

    const emailChanged = req.body.email !== user.email;
    if (emailChanged || nextPassword) {
      const matches = currentPassword
        ? await bcrypt.compare(currentPassword, user.password)
        : false;
      if (!matches) {
        const error = new Error('Validation failed.');
        error.statusCode = 422;
        error.data = [
          {
            path: 'currentPassword',
            msg: currentPassword
              ? 'Current password does not match.'
              : 'Enter your current password to change your email or password.'
          }
        ];
        throw error;
      }
    }

    user.firstName = req.body.firstName;
    user.lastName = req.body.lastName;
    user.email = req.body.email;
    user.status = req.body.status;
    if (nextPassword) {
      user.password = await bcrypt.hash(nextPassword, 12);
    }
    await user.save();

    const names = presentName(user);
    res.status(200).json({
      message: 'Profile updated.',
      user: {
        id: user._id.toString(),
        firstName: names.firstName,
        lastName: names.lastName,
        email: user.email,
        status: user.status
      }
    });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.liveTicket = (req, res) => {
  const token = jwt.sign({ purpose: 'live', userId: req.userId }, jwtSecret(), {
    expiresIn: '5m',
    algorithm: 'HS256'
  });
  res.status(200).json({ token });
};

exports.getUserStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      const error = new Error('User not found.');
      error.statusCode = 404;
      throw error;
    }
    res.status(200).json({ status: user.status });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.updateUserStatus = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error('Validation failed.');
    error.statusCode = 422;
    error.data = errors.array();
    throw error;
  }
  const newStatus = req.body.status;
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      const error = new Error('User not found.');
      error.statusCode = 404;
      throw error;
    }
    user.status = newStatus;
    await user.save();
    res.status(200).json({ message: 'User updated.' });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};
