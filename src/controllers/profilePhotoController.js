const User = require("../models/User");
const { normalizeStoredImageUrl } = require("../utils/userNormalizer");

const allowedImageMime = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

exports.uploadProfilePhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded (field name must be 'file')" });
    }

    if (!allowedImageMime.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: "Only image files are allowed (jpg, jpeg, png, webp).",
      });
    }

    const userId = req.user.id || req.user._id;

    const fileName = req.file.filename;
    const url = normalizeStoredImageUrl(`/uploads/${fileName}`);

    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    await user.update({ profileImageUrl: url, profileImageFileName: fileName });
    await user.reload();
    const profileImageVersion = user.updatedAt ? new Date(user.updatedAt).getTime() : null;

    return res.status(200).json({
      success: true,
      message: "Profile picture uploaded",
      photoUrl: user.profileImageUrl,
      data: {
        profileImageUrl: user.profileImageUrl,
        profilePicture: user.profileImageUrl,
        profileImageFileName: user.profileImageFileName,
        profileImageVersion,
        updatedAt: user.updatedAt,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getProfilePhoto = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    const user = await User.findByPk(userId, {
      attributes: ["profileImageUrl", "profileImageFileName", "updatedAt"],
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const u = user.toJSON();

    const profileImageUrl = normalizeStoredImageUrl(u.profileImageUrl);

    if (!profileImageUrl) {
      return res.status(200).json({
        success: true,
        message: "No profile picture uploaded yet",
        data: { profileImageUrl: "", profilePicture: "", profileImageFileName: "", profileImageVersion: null, updatedAt: u.updatedAt || null },
      });
    }

    const profileImageVersion = u.updatedAt ? new Date(u.updatedAt).getTime() : null;

    return res.status(200).json({
      success: true,
      photoUrl: profileImageUrl,
      data: {
        profileImageUrl,
        profilePicture: profileImageUrl,
        profileImageFileName: u.profileImageFileName,
        profileImageVersion,
        updatedAt: u.updatedAt,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
