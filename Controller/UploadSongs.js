import SongsModel from "../Models/SongsModel.js";
import UserModel from "../Models/UserModel.js";
import cloudinary from "../config/cloudinary.js";

export const UploadSong = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await UserModel.findById(id);
    if (user.role != "admin") {
      return res.status(404).json({ message: "User not found" });
    }

    const musicFile = req.file;

    if (!musicFile) {
      return res.status(400).json({ message: "Music file is required" });
    }

    const uploadResult = await cloudinary.uploader.upload(
      musicFile.path,
      {
        resource_type: "auto",
        folder: "songs",
      }
    );


    const {
      category,
      ownerName,
      musicName,
      artist,
      releaseDate,
      language,
      genre,
      mood,
      pricing,
      songsLinks,
      
    } = req.body;

    // Save to DB
    const newSong = await SongsModel.create({
      UploadBy: id,
      musicInfo: {
        category,
        songUrl: uploadResult.secure_url,
        coverImageUrl: "", 
        ownerName,
        musicName,
        artist,
        releaseDate,
        language,
        genre,
        mood,
      },
      pricing: pricing || 0,
    });

    res.status(201).json({
      message: "Song uploaded successfully",
      data: newSong,
    });

  } catch (error) {
    console.error("Error uploading song:", error);
    res.status(500).json({ message: "Failed to upload song" });
  }
};
