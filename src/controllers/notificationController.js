const Notification = require("../models/Notification");
const { cleanupExpiredImportantDocuments } = require("../services/importantDocumentsService");

const toNotificationJson = (notification) => {
  const item = typeof notification?.toJSON === "function" ? notification.toJSON() : notification;
  return {
    ...item,
    _id: item.id,
  };
};

const listMyNotifications = async (req, res) => {
  try {
    await cleanupExpiredImportantDocuments();

    const notifications = await Notification.findAll({
      where: { userId: req.user._id },
      order: [["createdAt", "DESC"]],
      limit: 50,
    });

    res.json({ notifications: notifications.map(toNotificationJson) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const markNotificationAsRead = async (req, res) => {
  try {
    await cleanupExpiredImportantDocuments();

    const notification = await Notification.findOne({
      where: { id: req.params.id, userId: req.user._id },
    });

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    await notification.update({
      isRead: true,
      readAt: new Date(),
    });

    res.json({ notification: toNotificationJson(notification) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  listMyNotifications,
  markNotificationAsRead,
};
