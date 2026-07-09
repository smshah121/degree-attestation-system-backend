/* eslint-disable prettier/prettier */
import cloudinary from './cloudinary.config';
import fs from 'fs';

export const uploadImage = async (filePath: string): Promise<string> => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'degree', // optional folder in Cloudinary
    });

    return result.secure_url; // save this in DB
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  } finally {
    // Remove local file after upload
    fs.unlinkSync(filePath);
  }
};
