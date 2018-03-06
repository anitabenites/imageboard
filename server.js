const express = require ('express');

const app = express();

const config = require('./config');

const knox = require('knox');

const fs = require('fs');

const uidSafe = require('uid-safe');

const multer = require('multer');

const path = require('path');

const bodyParser = require('body-parser');
app.use(bodyParser.json());

const spicedPg = require('spiced-pg');

let db;
const {dbUser, dbPass} = require('./secrets')
db = spicedPg(`postgres:${dbUser}:${dbPass}@localhost:5432/imageboard`);

app.use(express.static(__dirname + '/public'));

var diskStorage = multer.diskStorage({
    destination: function (req, file, callback) {
        callback(null, __dirname + '/uploads');
    },
    filename: function (req, file, callback) {
      uidSafe(24).then(function(uid) {
          callback(null, uid + path.extname(file.originalname));
      });
    }
});

var uploader = multer({
    storage: diskStorage,
    limits: {
        fileSize: 2097152
    }
});

let secrets;
if (process.env.NODE_ENV == 'production') {
    secrets = process.env;
} else {
    secrets = require('./secrets');
}

const client = knox.createClient({
    key: secrets.AWS_KEY,
    secret: secrets.AWS_SECRET,
    bucket: 'imageboardwork'
});


function uploadToS3(req, res, next) {
    console.log(req.file);
    const s3Request = client.put(req.file.filename, {
        'Content-Type': req.file.mimetype,
        'Content-Length': req.file.size,
        'x-amz-acl': 'public-read'
    });

    const readStream = fs.createReadStream(req.file.path);

    readStream.pipe(s3Request);

    //acess images in https://s3.amazonaws.com/:Bucket/:filename

    s3Request.on('response', s3Response => {
        const wasSuccessful = s3Response.statusCode == 200;
        console.log(s3Response.statusCode);
        if(wasSuccessful){
            next();
        }else {
            res.sendStatus(500);
        }
    });
}

//how many images do we want to the user to see in a row in the browser
const numImagesToShow = 3;

//stores the number of images in the database:
var numImagesAvailable;
var currImageIndex;

app.get('/images', function(req, res){
    getInfoFromDb().then(resp => {
       numImagesAvailable = resp.rows.length; //it is just counting the number of images that is on the table.
       //resp.rows is an array. [{},{}]
       currImageIndex = resp.rows[resp.rows.length - 1].id;
       //query the database for the required images now i.e the last three, the most recent images in the database
        getImagesFromDb().then(function(images){
            if(numImagesToShow > numImagesAvailable) {
                numImagesAvailable = 0;
            }
            else {
                numImagesAvailable = numImagesAvailable - numImagesToShow;
            }
            currImageIndex = currImageIndex - numImagesToShow;
            res.json({
                imagesLeft: numImagesAvailable,
                images:images.rows.map(function(image){
                    //config.s3Url: imageboardwork
                    image.image = config.s3Url + image.image
                    return image
                }),
            })
        }).catch(error => {
            console.log('caught', error.message);
         });
    })
});

app.get('/more-images', function(req, res) {
    //executed when the show more button is clicked
    getImagesFromDb().then(function(images){
        //same as above
        if(numImagesToShow > numImagesAvailable) {
            numImagesAvailable = 0;
        }
        else {
            numImagesAvailable = numImagesAvailable - numImagesToShow;
        }
        currImageIndex = currImageIndex - numImagesToShow;
        res.json({
            imagesLeft: numImagesAvailable,
            images:images.rows.map(function(image){
                //map iterates through the images array and returns a new array with the same length
                //create the whole URL
                //since we are only storing the id in the table we need the amazon s3 url stored in config.s3Url
                image.image = config.s3Url + image.image
                return image
            }),
        })
    }).catch(error => {
        console.log('caught', error.message);
     });
})

//when the modal for a single image is opened
app.get('/image/:imageId', function(req, res){
        //Promise all waits for both the functions to return their values and then go forward
        return Promise.all ([
                getOneImage(req.params.imageId),
                showComments(req.params.imageId)
        ])
        //getOneImage will return the image
        //showComments will return the comments for the image
        .then(function([image,comment]){
        //create the whole URL
        //since we are only storing the id in the table we need the amazon s3 url stored in config.s3Url
        image.rows[0].image = config.s3Url + image.rows[0].image;
        //return the response
        res.json({
            imageData: image.rows[0], // imageData is how I have to access to the client!!
            comment: comment.rows //see script line87, we use comment there to connect with the client!
        })

    }).catch(function(err){
        console.log('this is the err', err);
    })
})


app.post('/upload-messages', function(req, res) {
    console.log(req.body);
    const {id, text, username} = req.body;
    addMessages(text, username, id).then((result) => {
        console.log('uploaded comment');
    });
})



const getImagesFromDb = function() {
    //select images whose ids are less than the id of the last image displayed in the browser
    //limit restricts the number of rows returned according to our condition.
    // $1 is going to be replaced by currentindex! (for instance: image number 11)
    //$2 will be replaced by number of images to show
    const q = "SELECT * FROM images WHERE id <= $1 ORDER BY created_at DESC LIMIT $2";
    //currImageIndex and numImagesToShow has been declared outside as global variables.
    let params = [currImageIndex, numImagesToShow];
    return db.query(q, params);
}


const getInfoFromDb = function() {
    const q = "SELECT * FROM images";
    return db.query(q);
}


const newImages = function(image,username,title,description) {
    const q = "INSERT INTO images (image, username,title,description) VALUES($1,$2,$3,$4)"
    const params = [image, username, title, description]
    return db.query(q,params);
}


const getOneImage = function(id) {
    const q = `SELECT * FROM images WHERE id = $1`
    const params = [id]
    return db.query(q,params);
}

const addMessages = function(comment, username, image_id) {
    const q = `INSERT INTO comments (comment,username,image_id) VALUES ($1,$2,$3)`
    const params = [comment, username, image_id]
    console.log(`comment: ${comment}, username: ${username} id ${image_id}`)
    return db.query(q, params);
}

const showComments = function(image_id) {
    const q = `SELECT * FROM comments WHERE image_id = $1`
    const params = [image_id]
    return db.query(q, params);
}

app.post('/upload-image', uploader.single('file'), uploadToS3, (req,res) => {
    console.log('running post upload-image', req.file)
    if(req.file) {
        console.log('this is the req.file:', req.file);
        console.log('this is the req.body:', req.body);
        newImages(req.file.filename, req.body.username, req.body.title, req.body.description)
            .then(result => {
                console.log('it worked')
                res.json({success: true})
            })
    } else {
        res.json({success:false})
    }

});


app.listen(8080);
