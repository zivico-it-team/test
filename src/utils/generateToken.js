const jwt = require("jsonwebtoken");

const generateToken = (user) => {
  const id = user?.id || user?._id;
  return jwt.sign(
    { id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );
};

module.exports = generateToken;
