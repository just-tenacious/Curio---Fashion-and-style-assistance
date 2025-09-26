const http = require("http");
const { MongoClient } = require("mongodb");
const jwt = require("jsonwebtoken");
const JWT_SECRET = "curioSuperSecretKey123!";

// MongoDB connection
const uri = "mongodb://127.0.0.1:27017";
const client = new MongoClient(uri);
const dbName = "curio";
const contactCollection = "Contact";
const usersCollection = "Users"; // separate collection for registrations
const MAX_BODY_SIZE = 1e6; // 1MB

// Connect to MongoDB
async function connectDB() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB successfully");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
}

// Save contact to DB
async function saveContact(data) {
  try {
    const db = client.db(dbName);
    const collection = db.collection(contactCollection);
    const result = await collection.insertOne({
      ...data,
      createdAt: new Date(),
    });
    console.log("📩 Saved contact:", result.insertedId);
    return true;
  } catch (err) {
    console.error("❌ DB Error:", err);
    return false;
  }
}

// Save registration data
async function saveRegistration(data) {
  try {
    const db = client.db(dbName);
    const collection = db.collection(usersCollection);
    const now = new Date();

    const userDoc = {
      fullname: data.fullname || "Anonymous",
      username: data.username,
      dob: data.dob || null,
      gender: data.gender || "unspecified",
      email: data.email,
      password: data.password, // ⚠️ Hash in production
      is_admin: 0,
      acc_status: 0,
      created_at: now,
      updated_at: now,
    };

    await collection.insertOne(userDoc);
    console.log("👤 Registered user:", data.username);
    return { success: true };
  } catch (err) {
    console.error("❌ Registration DB Error:", err);
    return { success: false, error: err.message };
  }
}

// Login user
async function loginUser(data) {
  try {
    const db = client.db(dbName);
    const collection = db.collection(usersCollection);

    const user = await collection.findOne({ email: data.email, password: data.password });
    if (!user) return { success: false, error: "Invalid email or password" };

    // Create JWT token
    const token = jwt.sign(
      { id: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    return { success: true, username: user.username, token };
  } catch (err) {
    console.error("❌ Login DB Error:", err);
    return { success: false, error: err.message };
  }
}

// Create HTTP server
const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  let body = "";
  req.on("data", chunk => {
    body += chunk.toString();
    if (body.length > MAX_BODY_SIZE) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Payload too large" }));
      req.destroy();
    }
  });

  req.on("end", async () => {
    try {
      const data = JSON.parse(body);

      // Handle /contact
      if (req.method === "POST" && req.url === "/contact") {
        const success = await saveContact({
          name: data.name || data.username,
          email: data.email,
          message: data.message || data.text,
        });
        res.writeHead(success ? 201 : 500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: success ? "ok" : "error" }));
        return;
      }

      // Handle /register
      if (req.method === "POST" && req.url === "/register") {
        const result = await saveRegistration(data);
        if (result.success) {
          res.writeHead(201, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok", message: "Registered successfully" }));
        } else {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: result.error }));
        }
        return;
      }

      // Handle /login
      if (req.method === "POST" && req.url === "/login") {
        const result = await loginUser(data);
        if (result.success) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            status: "ok",
            username: result.username,
            token: result.token
          }));
        } else {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: result.error }));
        }
        return;
      }

      // Unknown route
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));

    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
    }
  });
});

// Start server after DB connects
connectDB().then(() => {
  server.listen(3001, () => {
    console.log("🚀 Server running at http://localhost:3001");
  });
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("🛑 Closing MongoDB connection...");
  await client.close();
  process.exit(0);
});
