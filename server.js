const mongoose = require('mongoose')
const express = require('express')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')
const { check, validationResult } = require('express-validator');

const UserModel = require('../server/models/UserModel')
const PostModel = require('../server/models/PostModel')

const app = express()

app.use(express.json())

app.use(cookieParser())


//connection between node and mongodb
mongoose.connect('mongodb://127.0.0.1:27017/Crud')

const db = mongoose.connection
db.on('error', (error) => {
    console.error('MongoDB connection error:', error);
});

db.once('open', () => {
    console.log('Connected to MongoDB');
});


//api for verification
const verifyUser = (req , res, next) => {
    const token = req.cookies.token;
    if(!token){
        return res.json("The token is missing")
    } else {
        jwt.verify(token, "jwt-secret-key", (err, decoded) => {
            if(err){
                return res.json('The token is wrong')
            } else {
                req.email = decoded.email;
                req.username = decoded.username;
                next()
            }
        })
    }
}

app.get('/',verifyUser, (req, res) => {
    return res.json({email: req.email, username: req.username})
})


//api for user registration
app.post('/register', (req, res) => {
    const { username, email, password } = req.body;
    bcrypt.hash(password, 10)
        .then(hash => {
            UserModel.create({username, email, password: hash})
                .then(user => res.json(user))
                .catch(err => res.json(err))
        }).catch(err => console.log(err))

})


//api for user login
app.post('/login', (req, res) => {
    const {email, password} = req.body;
    UserModel.findOne({email: email})
    .then(user => {
        if(user){
            bcrypt.compare(password, user.password, (err, response) => {
                if(response){
                    const token = jwt.sign({email: user.email, username: user.username}, 
                        'jwt-secret-key', {expiresIn: '1d'})
                        res.cookie('token', token)
                        return res.json("Success")
                } else{
                    return res.json("Password is incorrect")
                }
            })
        } else{
            res.json("User not exist")
        }
    })
})

//api for creating post
app.post('/create', [
    verifyUser,
    check('title').not().isEmpty().withMessage('Title is required'),
    check('body').not().isEmpty().withMessage('Body is required'),
    check('createdby').not().isEmpty().withMessage('Created By is required'),
    check('status').isIn(['active', 'deactive']).withMessage('Status must be either draft or published'),
    check('location').isArray({ min: 2, max: 2 }).withMessage('Location must be an array of two numbers [latitude, longitude]'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
], (req, res) => {
    PostModel.create({
        title: req.body.title,
        body: req.body.body,
        createdby: req.body.createdby,
        status: req.body.status,
        location: req.body.location
    })
        .then(result => res.json("Success"))
        .catch(err => res.json(err))
});


//api for getting all posts
app.get('/getposts', (req, res) => {
    PostModel.find()
    .then(posts => res.json(posts))
    .catch(err => res.json(err))
});


//api for getting post by using id
app.get('/getpostbyid/:id', [
    check('id').isMongoId().withMessage('Invalid post ID'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
], (req, res) => {
    const id = req.params.id;
    PostModel.findById({ _id: id })
    .then(post => res.json(post))
    .catch(err => console.log(err))
});


//api for editing the post
app.put('/editpost/:id', [
    verifyUser,
    check('id').isMongoId().withMessage('Invalid post ID'),
    check('title').optional().not().isEmpty().withMessage('Title cannot be empty'),
    check('description').optional().not().isEmpty().withMessage('Description cannot be empty'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
], (req, res) => {
    const id = req.params.id;
    PostModel.findByIdAndUpdate(
        { _id: id },
        { title: req.body.title, description: req.body.description },
        { new: true }
    )
    .then(result => res.json('Success'))
    .catch(err => console.log(err))
});


//api for delete
app.delete('/deletepost/:id', [
    verifyUser,
    check('id').isMongoId().withMessage('Invalid post ID'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
], (req, res) => {
    const id = req.params.id;
    PostModel.findByIdAndDelete({ _id: id })
    .then(result => res.json('Success'))
    .catch(err => res.json(err))
});


//api for counting status (active/deactive)
app.get('/statuscount', (req, res) => {
    PostModel.aggregate([
        {
            $match: {status: { $in: ["active", "deactive"]}}
        },
        {
            $group: {
                _id: "$status",
                count: {$sum: 1}
            }
        }
    ]).then(result => res.json(result))
    .catch(err => res.json(err))
})


//api for retrieving posts using latitude and longitude
app.get('/geolocation', (req, res) => {
    const { latitude, longitude } = req.body;

    if (latitude === undefined || longitude === undefined) {
        return res.status(400).json({ message: 'Latitude and longitude are required' });
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (isNaN(lat) || lat < -90 || lat > 90) {
        return res.status(400).json({ message: 'Latitude must be a number between -90 and 90' });
    }

    if (isNaN(lon) || lon < -180 || lon > 180) {
        return res.status(400).json({ message: 'Longitude must be a number between -180 and 180' });
    }

    PostModel.findOne({ location: [lat, lon] })
        .then(result => {
            if (!result) {
                return res.status(404).json({ message: 'No post found at the given location' });
            }
            res.json(result);
        })
        .catch(err => {
            console.error(err);
            res.status(500).json({ message: 'An error occurred while fetching the post', error: err.message });
        });
});



app.listen(4000, ()=> {
    console.log("Server is running...")
})