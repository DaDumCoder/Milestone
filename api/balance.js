const { ethers } = require("ethers");

// Connect to the Soneium RPC endpoint
const RPC_URL = "https://rpc.soneium.org";
const provider = new ethers.JsonRpcProvider(RPC_URL);

// ERC-20 contract details
const CONTRACT_ADDRESS = "0xD1CAe16ec9eC34CE906F2C425B554042CA04Fa4E";
const ABI = ["function balanceOf(address) view returns (uint256)"];

// In-memory store for the current "day" (default to 1)
let currentDay = 1;

module.exports = async (req, res) => {
  // Handle PUT requests to update the current day
  if (req.method === "PUT") {
    const { day } = req.body;
    if (!Number.isInteger(day) || day < 1) {
      return res.status(400).json({ error: "Invalid day value" });
    }
    currentDay = day;
    return res.status(200).json({ message: "Day updated", day: currentDay });
  }

  // Handle GET requests to fetch balance and current day
  if (req.method === "GET") {
    const { address } = req.query;
    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
      const rawBalance = await contract.balanceOf(address);
      const balance = parseFloat(ethers.formatUnits(rawBalance, 18));

      return res.status(200).json({
        address,
        balance,
        day: currentDay
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Method not allowed
  res.setHeader("Allow", ["GET", "PUT"]);
  res.status(405).end(`Method ${req.method} Not Allowed`);
};
