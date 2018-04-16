'use strict';

const AWS = require('aws-sdk');
const S3 = new AWS.S3();
const Sharp = require('sharp');

const BUCKET = process.env.BUCKET;
const URL = process.env.URL;
const NOIMAGE = process.env.NOIMAGE;

exports.handler = function(event, context, callback) {
  const key = event.queryStringParameters.key;

  var arrMatches = key.split('/');
  const strFilename = arrMatches.pop();
  
  const arrDimensions = arrMatches.pop().split('x');
  const strFolder = arrMatches.join('/');

  const bolCrop = ((arrDimensions[1]+'').indexOf('c') !== -1);
  const bolUpscale = ((arrDimensions[1]+'').indexOf('u') !== -1);
  const intWidth = parseInt(arrDimensions[0], 10) || 0;
  const intHeight = parseInt((arrDimensions[1]+'').replace(/[^0-9]/, ''), 10) || 0;

  S3.getObject({Bucket: BUCKET, Key: (strFolder+'/Original/'+strFilename)}).promise()
    .then(data => {
      var obj = Sharp(data.Body);
      return obj.metadata().then(metadata => {
        if(arrDimensions[0]=='Full' || ((metadata.width < intWidth && metadata.height < intHeight) && !bolCrop && !bolUpscale)) {
          //Only need to rotate image, and save in the "Full" folder.
          obj.rotate().toFormat('jpeg');
          obj.toBuffer()
            .then(buffer => {
              return S3.putObject({
                Body: buffer,
                Bucket: BUCKET,
                CacheControl: 'max-age=31536000',
                ContentType: 'image/jpeg',
                Key: strFolder+'/Full/'+strFilename,
              }).promise()
            })
            .then(() => callback(null, {
              statusCode: '301',
              headers: {'location': URL + '/' + strFolder+'/Full/'+strFilename},
              body: '',
            }))
            .catch(error => {
              console.log(error);
            });
        } else {
          obj.rotate().resize(intWidth, intHeight).toFormat('jpeg');

          if(bolCrop) {
            obj.crop();
          } else {
            obj.max();
            if(!bolUpscale) {
              obj.withoutEnlargement();
            }  
          }
          obj.toBuffer()
            .then(buffer => {
              return S3.putObject({
                Body: buffer,
                Bucket: BUCKET,
                CacheControl: 'max-age=31536000',
                ContentType: 'image/jpeg',
                Key: key,
              }).promise()
            })
            .then(() => callback(null, {
              statusCode: '301',
              headers: {'location': `${URL}/${key}`},
              body: '',
            }))
            .catch(error => {
              console.log(error);
            });
        }
      });
    })
    .catch(error => {
      console.log(error);
      return callback(null, {
        statusCode: '404',
        headers: {'Content-type':'text/plain'},
        body: '404 Not found' + strFolder+'/Original/'+strFilename+ '  ' + parseInt(arrDimensions[0]) + ' ... ' + parseInt(arrDimensions[1]) + ' - ' + intHeight + '::' + intWidth,
      })
    })
    
}
