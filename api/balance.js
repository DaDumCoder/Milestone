// server.js
const express = require('express')
const bodyParser = require('body-parser')
const { ethers } = require('ethers')

const RPC_URL = process.env.RPC_URL   // e.g. https://rpc.soneium.org
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS
const THRESHOLD_PER_DAY = ethers.BigNumber.from('10000')

const provider = new ethers.JsonRpcProvider(RPC_URL)
const ABI = ['function balanceOf(address) view returns (uint256)']
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider)

const app = express()
app.use(bodyParser.json())

// In‐memory store: for production swap out for Redis/DB
const users = new Map()

/**
 * Helper—lazy initialize user state
 */
function getUserState(address, currentBalance) {
  if (!users.has(address)) {
    // first time: baseline = prevBalance = current on‐chain balance; day = 1
    users.set(address, {
      prevBalance: currentBalance,
      currentDay: 1,
      milestones: Array(10).fill(false),
    })
  }
  return users.get(address)
}

/**
 * GET /api/milestone?address=<wallet>
 *
 * Returns:
 *  - currentDay
 *  - threshold (prevBalance + 10000)
 *  - currentBalance
 *  - milestoneAchieved (for today)
 *  - milestones (array of booleans for days 1–10)
 */
app.get('/api/milestone', async (req, res) => {
  try {
    const { address } = req.query
    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid wallet address' })
    }

    const currentBalance = await contract.balanceOf(address)
    const state = getUserState(address, currentBalance)

    // compute today’s threshold
    const threshold = state.prevBalance.add(THRESHOLD_PER_DAY)

    // check if user has met today’s goal
    const gotIt = currentBalance.gte(threshold)
    state.milestones[state.currentDay - 1] = gotIt

    return res.json({
      currentDay:   state.currentDay,
      threshold:    threshold.toString(),
      currentBalance: currentBalance.toString(),
      milestoneAchieved: gotIt,
      milestones:   state.milestones
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

/**
 * PUT /api/day
 * body: { address: string, day: number }
 *
 * Resets or advances the day:
 *  - If day === 1 ⇒ full reset: prevBalance ← on‐chain balance; clear milestones
 *  - Else if 2 ≤ day ≤ 10 ⇒ prevBalance ← on‐chain balance; set currentDay
 */
app.put('/api/day', async (req, res) => {
  try {
    const { address, day } = req.body
    if (!address || !ethers.isAddress(address) || typeof day !== 'number') {
      return res.status(400).json({ error: 'Invalid payload' })
    }
    if (day < 1 || day > 10) {
      return res.status(400).json({ error: 'Day must be between 1 and 10' })
    }

    const currentBalance = await contract.balanceOf(address)
    let state = users.get(address)

    if (day === 1 || !state) {
      // reset
      state = {
        prevBalance: currentBalance,
        currentDay: 1,
        milestones: Array(10).fill(false),
      }
      users.set(address, state)
    } else {
      // advance
      state.prevBalance = currentBalance
      state.currentDay = day
      // leave old milestones intact
    }

    return res.json({
      message:    day === 1 ? 'Reset to Day 1' : `Moved to Day ${day}`,
      currentDay: state.currentDay
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// start
const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`✅ Listening on port ${PORT}`))
