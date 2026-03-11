const { Op } = require("sequelize");
const Upload = require("../models/Upload");
const FileShare = require("../models/FileShare");
const User = require("../models/User");

const isUUID = (id) =>
  typeof id === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

/* ================================
   LIST FILES (Search + Filter)
================================ */
const listTeamFiles = async (req, res) => {
  try {
    const search = (req.query.search || "").trim();
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Number(req.query.limit || 12));
    const offset = (page - 1) * limit;

    const where = {};
    if (search) where.originalName = { [Op.like]: `%${search}%` };

    const { count: total, rows } = await Upload.findAndCountAll({
      where,
      include: [{ model: FileShare, as: "share", required: false, attributes: ["id"] }],
      order: [["createdAt", "DESC"]],
      offset,
      limit,
    });

    const files = rows.map((f) => {
      const o = f.toJSON();
      o._id = o.id;
      return {
        _id: o.id,
        name: o.originalName,
        fileName: o.fileName,
        fileType: o.mimeType,
        size: o.size,
        url: o.url,
        createdAt: o.createdAt,
        isShared: !!o.share,
      };
    });

    const sharedCount = await FileShare.count();

    res.json({
      page,
      limit,
      total,
      stats: {
        totalFiles: total,
        sharedFiles: sharedCount,
      },
      files,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ================================
   SHARE FILE
================================ */
const shareFile = async (req, res) => {
  try {
    const { fileId, shareToTeam, userIds } = req.body;

    if (!fileId || !isUUID(fileId))
      return res.status(400).json({ message: "Valid fileId required" });

    const file = await Upload.findByPk(fileId);
    if (!file) return res.status(404).json({ message: "File not found" });

    let scope = "users";
    let sharedWith = [];

    if (shareToTeam === true) {
      scope = "team";
    } else {
      if (!Array.isArray(userIds) || userIds.length === 0)
        return res.status(400).json({ message: "userIds required" });

      sharedWith = userIds.filter(isUUID);
    }

    await FileShare.upsert({
      fileId,
      sharedById: req.user._id,
      scope,
      sharedWith,
    });

    const share = await FileShare.findOne({ where: { fileId } });

    res.json({ message: "File shared successfully", share: share.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ================================
   GET SHARE INFO
================================ */
const getFileShare = async (req, res) => {
  try {
    const { fileId } = req.params;
    if (!isUUID(fileId)) return res.status(400).json({ message: "Invalid fileId" });

    const share = await FileShare.findOne({
      where: { fileId },
      include: [{ model: User, as: "sharedBy", attributes: ["id", "name", "email"] }],
    });

    if (!share) return res.json({ share: null });

    const s = share.toJSON();
    s._id = s.id;
    s.file = s.fileId;

    const ids = Array.isArray(s.sharedWith) ? s.sharedWith : [];
    const sharedWithUsers = ids.length
      ? await User.findAll({
          where: { id: { [Op.in]: ids } },
          attributes: ["id", "name", "email", "role", "professional"],
        })
      : [];

    s.sharedWith = sharedWithUsers.map((u) => {
      const o = u.toJSON();
      o._id = o.id;
      return o;
    });

    if (share.sharedBy) {
      s.sharedBy = { ...share.sharedBy.toJSON(), _id: share.sharedBy.id };
    }

    res.json({ share: s });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ================================
   UNSHARE FILE
================================ */
const unshareFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    if (!isUUID(fileId)) return res.status(400).json({ message: "Invalid fileId" });

    await FileShare.destroy({ where: { fileId } });

    res.json({ message: "File unshared" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ================================
   PEOPLE LIST (Share Modal)
================================ */
const listPeople = async (req, res) => {
  try {
    const users = await User.findAll({
      where: { role: { [Op.in]: ["employee", "manager"] } },
      attributes: ["id", "name", "email", "role", "professional"],
      order: [["name", "ASC"]],
    });

    res.json({
      users: users.map((u) => {
        const o = u.toJSON();
        o._id = o.id;
        return o;
      }),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  listTeamFiles,
  shareFile,
  getFileShare,
  unshareFile,
  listPeople,
};
