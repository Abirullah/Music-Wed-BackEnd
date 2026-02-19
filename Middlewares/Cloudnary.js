import cloudinary from '../Config/cloudnary.js';


export const uploadImageToCloudinary = async (filePath) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'profile_pictures',
    });
    return result.secure_url; 
  } catch (error) {
    console.error('Error uploading image to Cloudinary:', error);
    throw error; 
  }
};


export const uploadSongToCloudinary = async (filePath) => {
  try { 
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: 'auto', 
      folder: 'songs', 
    });
    return result.secure_url; 
  } catch (error) {
    console.error('Error uploading song to Cloudinary:', error);
    throw error; 
  }
};

export const uploadCoverImageToCloudinary = async (filePath) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'cover_images', 
    });
    return result.secure_url; 
  } catch (error) {
    console.error('Error uploading cover image to Cloudinary:', error);
    throw error; 
  }
};





