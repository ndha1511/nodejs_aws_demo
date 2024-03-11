import express from 'express';
import multer from 'multer';
import AWS from 'aws-sdk';
import dotenv from 'dotenv';
import path from 'path';
const PORT = 3000;

// config .env
dotenv.config();


const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = "1";

AWS.config.update({
    region: process.env.REGION,
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY
});

const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();

const bucketName = process.env.S3_BUCKET_NAME;
const tableName = process.env.DYNAMODB_TABLE_NAME;

const storage = multer.memoryStorage({
    destination(req, file, callback) {
        callback(null, "");
    }
})

const upload = multer({
    storage,
    limits: { fileSize: 5000000},
    fileFilter(req, file, cb) {
        checkFileType(file, cb);
    }
})

const checkFileType = (file, cb) => {
    const fileTypes = /jpeg|jpg|png|gif/;
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = fileTypes.test(file.mimetype);
    if(extname && mimetype) {
        return cb(null, true);
    }
    return cb("Error: Pls upload image")
}


app.set('view engine', 'ejs'); 
app.set('views', './views');

app.get('/', async (req, res) => {
    try {
        const params = { TableName: tableName };
        const data = await dynamodb.scan(params).promise();
        return res.render("index.ejs", {data: data.Items})
    } catch (error) {
        console.error(error);
        return res.status(500).send("Internal Server Error");
    }   
})

app.post('/delete', async (req, res) => {
    const dataDelete = JSON.parse(req.body.checkedBoxs);
    if(!dataDelete || dataDelete.length <= 0) {
        return res.redirect('/');
    } else {
        console.log(dataDelete)
        for(let i = 0; i < dataDelete.length; i++) {
            const params = {
                TableName: tableName,
                Key: {
                    id: Number(dataDelete[i])
                }
            };
            try {
                await dynamodb.delete(params).promise();
            } catch (error) {
                return res.status(500).send("Internal Server Error");
            }
            
        }
    }
    return res.redirect('/');
    
})

app.post('/add', upload.single("image"), (req, res) => {
    console.log(req.body);
    try {
        const id = Number(req.body.id);
        const name = req.body.name;
        const type = req.body.type;
        const semester = req.body.semester;
        const image = req.file?.originalname.split(".");
        const fileType = image[image.length - 1];
        const filePath = `${id}_${Date.now().toString()}.${fileType}`;
        const paramsS3 = {
            Bucket: bucketName,
            Key: filePath,
            Body: req.file.buffer,
            ContentType: req.file.mimetype
        }
        s3.upload(paramsS3, async(err, data) => {
            if(err) {
                console.error(err);
                return res.send("Internal server error");
            } else {
                const imageURL = data.Location;
                const paramsDynamo = {
                    TableName: tableName,
                    Item: {
                        id: Number(id),
                        name: name,
                        type: type,
                        semester: semester,
                        image: imageURL
                    }
                }
                await dynamodb.put(paramsDynamo).promise();
                return res.redirect("/");
            }
        })
    } catch (error) {
        console.log(error);
        return res.status(500).send("internal server error");
    }
    
});

app.listen(PORT, () => {
    console.log('listening on port ' + PORT);
})