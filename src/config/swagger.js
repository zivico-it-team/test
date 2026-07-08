const swaggerJsdoc = require("swagger-jsdoc");

const serverUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "CRM API",
      version: "1.0.0",
      description: "Simple Express API with Swagger",
    },
    servers: [
      {
        url: serverUrl,
      },
    ],
  },
  apis: ["./src/routes/*.js"], // same as your code
};


const swaggerSpec = swaggerJsdoc(swaggerOptions);

module.exports = swaggerSpec;
