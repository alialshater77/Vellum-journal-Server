const fs = require('fs');
const path = require('path');

const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

const { uploadDir } = require('../config');
const { looksLikeImage } = require('../util/image');
const io = require('../socket');
const Post = require('../models/post');
const User = require('../models/user');

const CREATOR_FIELDS = 'firstName lastName name';

function rejectId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error('Could not find post.');
    error.statusCode = 404;
    throw error;
  }
}

function rejectFakeImage(file) {
  if (!file || looksLikeImage(file.path)) return;
  fs.unlink(file.path, () => {});
  const error = new Error('Use a PNG or JPEG no larger than 1 MB.');
  error.statusCode = 422;
  throw error;
}

function presentCreator(user) {
  let firstName = user && user.firstName;
  let lastName = user && user.lastName;
  if (!firstName || !lastName) {
    const parts = String((user && user.name) || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!firstName) firstName = parts.shift() || 'Member';
    if (!lastName) lastName = parts.join(' ') || 'Member';
  }
  return {
    _id: user && (user._id || user),
    firstName,
    lastName
  };
}

exports.getPosts = async (req, res, next) => {
  const currentPage = req.query.page || 1;
  const perPage = 3;
  try {
    const totalItems = await Post.find().countDocuments();
    const posts = await Post.find()
      .populate('creator', CREATOR_FIELDS)
      .sort({ createdAt: -1 })
      .skip((currentPage - 1) * perPage)
      .limit(perPage);

    res.status(200).json({
      message: 'Fetched posts successfully.',
      posts: posts,
      totalItems: totalItems
    });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.createPost = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error('Validation failed, entered data is incorrect.');
    error.statusCode = 422;
    throw error;
  }
  if (!req.file) {
    const error = new Error('No image provided.');
    error.statusCode = 422;
    throw error;
  }
  rejectFakeImage(req.file);
  const imageUrl = 'images/' + req.file.filename;
  const title = req.body.title;
  const content = req.body.content;
  const post = new Post({
    title: title,
    content: content,
    imageUrl: imageUrl,
    creator: req.userId
  });
  try {
    await post.save();
    const user = await User.findById(req.userId);
    user.posts.push(post);
    await user.save();
    io.getIO().emit('posts', {
      action: 'create',
      post: { ...post._doc, creator: presentCreator(user) }
    });
    res.status(201).json({
      message: 'Post created successfully!',
      post: post,
      creator: presentCreator(user)
    });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.getPost = async (req, res, next) => {
  const postId = req.params.postId;
  try {
    rejectId(postId);
    const post = await Post.findById(postId).populate('creator', CREATOR_FIELDS);
    if (!post) {
      const error = new Error('Could not find post.');
      error.statusCode = 404;
      throw error;
    }
    res.status(200).json({ message: 'Post fetched.', post: post });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.updatePost = async (req, res, next) => {
  const postId = req.params.postId;
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error('Validation failed, entered data is incorrect.');
    error.statusCode = 422;
    throw error;
  }
  const title = req.body.title;
  const content = req.body.content;
  let imageUrl = req.body.image;
  if (req.file) {
    rejectFakeImage(req.file);
    imageUrl = 'images/' + req.file.filename;
  }
  if (!imageUrl) {
    const error = new Error('No file picked.');
    error.statusCode = 422;
    throw error;
  }
  try {
    rejectId(postId);
    const post = await Post.findById(postId).populate('creator', CREATOR_FIELDS);
    if (!post) {
      const error = new Error('Could not find post.');
      error.statusCode = 404;
      throw error;
    }
    if (!req.file && imageUrl !== post.imageUrl) {
      const error = new Error('No file picked.');
      error.statusCode = 422;
      throw error;
    }
    if (!post.creator || post.creator._id.toString() !== req.userId) {
      const error = new Error('Not authorized!');
      error.statusCode = 403;
      throw error;
    }
    if (imageUrl !== post.imageUrl) {
      clearImage(post.imageUrl);
    }
    post.title = title;
    post.imageUrl = imageUrl;
    post.content = content;
    const result = await post.save();
    io.getIO().emit('posts', { action: 'update', post: result });
    res.status(200).json({ message: 'Post updated!', post: result });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.deletePost = async (req, res, next) => {
  const postId = req.params.postId;
  try {
    rejectId(postId);
    const post = await Post.findById(postId).populate('creator', CREATOR_FIELDS);

    if (!post) {
      const error = new Error('Could not find post.');
      error.statusCode = 404;
      throw error;
    }
    if (!post.creator || post.creator._id.toString() !== req.userId) {
      const error = new Error('Not authorized!');
      error.statusCode = 403;
      throw error;
    }
    const snapshot = {
      _id: post._id,
      title: post.title,
      content: post.content,
      imageUrl: post.imageUrl,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      creator: presentCreator(post.creator)
    };
    clearImage(post.imageUrl);
    await Post.findByIdAndDelete(postId);

    const user = await User.findById(req.userId);
    user.posts.pull(postId);
    await user.save();

    io.getIO().emit('posts', { action: 'delete', post: snapshot });
    res.status(200).json({ message: 'Deleted post.' });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

const clearImage = filePath => {
  const name = path.basename(String(filePath || ''));
  if (!name || name === '.' || name === '..') return;
  fs.unlink(path.join(uploadDir(), name), () => {});
};
