const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
  email: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  // Older accounts stored a single name. It is copied into first and last name on save.
  name: {
    type: String
  },
  status: {
    type: String,
    default: 'I am new!'
  },
  posts: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Post'
    }
  ]
});

userSchema.pre('validate', function () {
  if (this.firstName && this.lastName) return;
  const parts = String(this.name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return;
  if (!this.firstName) this.firstName = parts.shift();
  if (!this.lastName) this.lastName = parts.join(' ') || 'Member';
});

module.exports = mongoose.model('User', userSchema);
