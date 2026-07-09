/* eslint-disable prettier/prettier */
import { v2 as cloudinary } from 'cloudinary';


cloudinary.config({
  secure: true, // ensures HTTPS URLs
});



export default cloudinary;
