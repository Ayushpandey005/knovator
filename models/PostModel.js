const mongoose = require('mongoose')

const PostSchema = new mongoose.Schema({
    title: String,
    body: String,
    createdby : String,
    status: String,
    location: [Number]
})

const PostModel = mongoose.model('posts', PostSchema)

module.exports = PostModel;