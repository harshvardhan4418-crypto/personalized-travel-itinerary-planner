import { jsPDF } from 'jspdf'

// Helper to sanitize text for standard PDF Type 1 fonts (Helvetica)
// Replaces currency symbols like ₹ with ASCII-safe equivalents
function sanitizeText(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/₹/g, 'INR ')
    .replace(/[—–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/•/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x00-\x7F\xA0-\xFF]/g, ' ') // Strip non-standard extended characters
    .trim()
}

// Calculate duration in days between two date strings
function calculateDays(startStr, endStr) {
  if (!startStr || !endStr) return null
  const start = new Date(startStr)
  const end = new Date(endStr)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null
  const diffTime = end.getTime() - start.getTime()
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1
  return diffDays > 0 ? diffDays : null
}

// Currency pattern matching
const CURRENCY_PATTERNS = {
  INR: /\b(inr|rupees?|rs\.?)\b|₹/i,
  USD: /\b(usd|dollars?)\b|\$/i,
  EUR: /\b(eur|euros?)\b|€/i,
  GBP: /\b(gbp|pounds?)\b|£/i,
  JPY: /\b(jpy|yen)\b|¥/i,
  CAD: /\b(cad)\b|c\$/i,
  AUD: /\b(aud)\b|a\$/i,
}

function parseActivityCost(costStr, tripCurrency) {
  if (costStr === null || costStr === undefined) return { valid: true, amount: 0, isFree: true }
  const trimmed = String(costStr).trim()
  if (!trimmed) return { valid: true, amount: 0, isFree: true }
  const lower = trimmed.toLowerCase()
  if (lower === 'free' || lower === '0' || lower === 'zero' || lower === 'none' || lower === 'n/a') {
    return { valid: true, amount: 0, isFree: true }
  }

  const normTrip = (tripCurrency || 'INR').trim().toUpperCase()
  const targetPattern = CURRENCY_PATTERNS[normTrip] || new RegExp('\\b' + normTrip + '\\b', 'i')

  for (const [code, pattern] of Object.entries(CURRENCY_PATTERNS)) {
    if (code !== normTrip && pattern.test(trimmed)) {
      return { valid: false, reason: 'mismatched' }
    }
  }

  if (!targetPattern.test(trimmed)) {
    return { valid: false, reason: 'unidentified' }
  }

  const cleanNum = trimmed.replace(/,/g, '')
  const match = cleanNum.match(/\d+(?:\.\d+)?/)
  if (match) {
    const val = parseFloat(match[0])
    if (!isNaN(val) && val >= 0) {
      return { valid: true, amount: val, isFree: false }
    }
  }

  return { valid: false, reason: 'invalid_number' }
}

function formatCurrencyAmount(amount, currencyCode) {
  if (amount === null || amount === undefined || isNaN(amount)) return 'N/A'
  const code = (currencyCode || 'INR').trim().toUpperCase()
  const rounded = Math.round(amount * 100) / 100
  const formatted = rounded.toLocaleString('en-US', {
    minimumFractionDigits: rounded % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return `${code} ${formatted}`
}

/**
 * Generate and download a PDF itinerary document.
 * @param {Object} trip - The trip record from Supabase
 * @param {Object} itinerary - The parsed itinerary object
 */
export function exportItineraryToPdf(trip, itinerary) {
  if (!itinerary) {
    throw new Error('No itinerary data available to export.')
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = 210
  const pageHeight = 297
  const margin = 15
  const contentWidth = pageWidth - margin * 2
  const maxY = pageHeight - 18 // Keep space for footer
  let currentY = margin

  // Page break helper
  function checkPageBreak(requiredHeight) {
    if (currentY + requiredHeight > maxY) {
      doc.addPage()
      currentY = margin + 5
      return true
    }
    return false
  }

  // Destination & Meta
  const destination = trip?.destination || itinerary?.destination || 'Destination'
  const startDate = trip?.start_date
  const endDate = trip?.end_date
  const datesText =
    startDate && endDate ? `${startDate} to ${endDate}` : 'Dates not set'
  const totalDays =
    itinerary?.total_days ||
    (Array.isArray(itinerary?.days) ? itinerary.days.length : null) ||
    calculateDays(startDate, endDate) ||
    1
  const daysLabel = totalDays === 1 ? 'Day' : 'Days'
  const travelStyle = trip?.travel_style || 'Standard'
  const pace = trip?.pace || 'Moderate'
  const tripCurrency = (trip?.currency || 'INR').trim().toUpperCase()

  // -------------------------------------------------------------
  // 1. HEADER SECTION
  // -------------------------------------------------------------
  // Background brand accent bar at the very top
  doc.setFillColor(24, 53, 47) // Dark emerald (#18352f)
  doc.rect(0, 0, pageWidth, 5, 'F')

  currentY = 16

  // Eyebrow
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(27, 89, 71) // Deep green (#1b5947)
  doc.text('PERSONALIZED TRAVEL ITINERARY', margin, currentY)
  currentY += 6

  // Main Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(24, 53, 47)
  doc.text(`${sanitizeText(destination)} Itinerary`, margin, currentY)
  currentY += 7

  // Trip Meta Subtitle
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(96, 113, 106) // Muted (#60716a)
  const metaText = `${datesText}  |  ${totalDays} ${daysLabel}  |  ${sanitizeText(travelStyle)} Style  |  ${sanitizeText(pace)} Pace`
  doc.text(metaText, margin, currentY)
  currentY += 5

  // Header separator rule
  doc.setDrawColor(220, 230, 224)
  doc.setLineWidth(0.5)
  doc.line(margin, currentY, margin + contentWidth, currentY)
  currentY += 6

  // -------------------------------------------------------------
  // 2. TRIP OVERVIEW / SUMMARY (if available)
  // -------------------------------------------------------------
  if (itinerary.summary) {
    const summaryClean = sanitizeText(itinerary.summary)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const summaryLines = doc.splitTextToSize(summaryClean, contentWidth - 10)
    const boxHeight = 10 + summaryLines.length * 4.2

    checkPageBreak(boxHeight + 4)

    // Summary Box background
    doc.setFillColor(238, 245, 238) // Light sage (#eef5ee)
    doc.setDrawColor(215, 230, 218)
    doc.roundedRect(margin, currentY, contentWidth, boxHeight, 2.5, 2.5, 'FD')

    // Box Header
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(27, 89, 71)
    doc.text('TRIP OVERVIEW', margin + 5, currentY + 5.5)

    // Box Body
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(45, 71, 62)
    doc.text(summaryLines, margin + 5, currentY + 10)

    currentY += boxHeight + 6
  }

  // -------------------------------------------------------------
  // 3. BUDGET & COST OVERVIEW
  // -------------------------------------------------------------
  // Calculate budget statistics
  const rawDailyBudget = trip?.daily_budget
  const dailyBudgetNum =
    rawDailyBudget !== null &&
    rawDailyBudget !== undefined &&
    rawDailyBudget !== '' &&
    !isNaN(Number(rawDailyBudget)) &&
    Number(rawDailyBudget) >= 0
      ? Number(rawDailyBudget)
      : null

  const plannedTripBudget =
    dailyBudgetNum !== null && totalDays !== null ? dailyBudgetNum * totalDays : null

  let totalEstimatedCost = 0
  let unparsedCostCount = 0

  const daysList = Array.isArray(itinerary?.days) ? itinerary.days : []

  daysList.forEach((day) => {
    const activities = day.activities || day.activity_list || []
    activities.forEach((act) => {
      const costStr = act.estimated_cost ?? act.cost ?? act.price ?? ''
      const parsed = parseActivityCost(costStr, tripCurrency)
      if (parsed.valid) {
        totalEstimatedCost += parsed.amount
      } else {
        unparsedCostCount++
      }
    })
  })

  const remainingBudget =
    plannedTripBudget !== null ? plannedTripBudget - totalEstimatedCost : null
  const avgDailyCost =
    totalDays && totalDays > 0 ? totalEstimatedCost / totalDays : null

  // Render Budget Box if budget or cost info exists
  const hasBudgetInfo = plannedTripBudget !== null || totalEstimatedCost > 0 || unparsedCostCount > 0
  if (hasBudgetInfo) {
    const budgetCardHeight = unparsedCostCount > 0 ? 30 : 25
    checkPageBreak(budgetCardHeight + 4)

    // Background Card
    doc.setFillColor(250, 250, 246) // Warm off-white
    doc.setDrawColor(220, 226, 220)
    doc.roundedRect(margin, currentY, contentWidth, budgetCardHeight, 2.5, 2.5, 'FD')

    // Section Header
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(27, 89, 71)
    doc.text('TRIP BUDGET & COST OVERVIEW', margin + 5, currentY + 5.5)

    // 4 Column Grid for budget values
    const colWidth = (contentWidth - 10) / 4
    const startX = margin + 5
    const rowY1 = currentY + 11
    const rowY2 = currentY + 16

    // Col 1: Planned Budget
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(96, 113, 106)
    doc.text('Planned Budget', startX, rowY1)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(24, 53, 47)
    doc.text(
      plannedTripBudget !== null ? formatCurrencyAmount(plannedTripBudget, tripCurrency) : 'Not specified',
      startX,
      rowY2
    )

    // Col 2: Total Estimated Cost
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(96, 113, 106)
    doc.text('Est. Activity Cost', startX + colWidth, rowY1)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(27, 89, 71)
    doc.text(formatCurrencyAmount(totalEstimatedCost, tripCurrency), startX + colWidth, rowY2)

    // Col 3: Remaining Budget
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(96, 113, 106)
    doc.text('Remaining Budget', startX + colWidth * 2, rowY1)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    if (remainingBudget !== null) {
      if (remainingBudget < 0) {
        doc.setTextColor(197, 48, 48) // Over budget red
        doc.text(`${formatCurrencyAmount(remainingBudget, tripCurrency)} (Over)`, startX + colWidth * 2, rowY2)
      } else {
        doc.setTextColor(34, 134, 58) // Under budget green
        doc.text(formatCurrencyAmount(remainingBudget, tripCurrency), startX + colWidth * 2, rowY2)
      }
    } else {
      doc.setTextColor(96, 113, 106)
      doc.text('N/A', startX + colWidth * 2, rowY2)
    }

    // Col 4: Daily Average
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(96, 113, 106)
    doc.text('Avg Daily Activity', startX + colWidth * 3, rowY1)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(24, 53, 47)
    doc.text(
      avgDailyCost !== null ? `${formatCurrencyAmount(avgDailyCost, tripCurrency)}/day` : 'N/A',
      startX + colWidth * 3,
      rowY2
    )

    // Note for unparsed costs
    if (unparsedCostCount > 0) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(7)
      doc.setTextColor(180, 83, 9)
      doc.text(
        `* Note: ${unparsedCostCount} activity cost(s) used varied formats or foreign currency and were excluded from numeric totals.`,
        startX,
        currentY + 23
      )
    }

    currentY += budgetCardHeight + 6
  }

  // -------------------------------------------------------------
  // 4. DAILY SCHEDULES & ACTIVITIES
  // -------------------------------------------------------------
  if (daysList.length === 0) {
    checkPageBreak(15)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(96, 113, 106)
    doc.text('No scheduled activities available.', margin, currentY + 5)
    currentY += 15
  } else {
    daysList.forEach((day, dayIndex) => {
      const dayNum = day.day_number ?? (dayIndex + 1)
      const dayTitle = day.title || `Day ${dayNum}`
      const dayDate = day.date ? ` - ${day.date}` : ''
      const activities = day.activities || day.activity_list || []

      // Calculate day's total cost
      let dayCostTotal = 0
      activities.forEach((act) => {
        const costStr = act.estimated_cost ?? act.cost ?? act.price ?? ''
        const p = parseActivityCost(costStr, tripCurrency)
        if (p.valid) dayCostTotal += p.amount
      })

      // Day Header: Need at least 22mm for day banner + first activity preview
      checkPageBreak(24)

      // Day Banner Box
      doc.setFillColor(24, 53, 47) // Dark emerald background
      doc.roundedRect(margin, currentY, contentWidth, 8, 1.5, 1.5, 'F')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(255, 255, 255)
      doc.text(`DAY ${dayNum}: ${sanitizeText(dayTitle).toUpperCase()}${dayDate}`, margin + 4, currentY + 5.5)

      // Day Cost Badge on the right
      if (dayCostTotal > 0) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        const costBadgeText = `Est: ${formatCurrencyAmount(dayCostTotal, tripCurrency)}`
        const badgeWidth = doc.getTextWidth(costBadgeText)
        doc.text(costBadgeText, margin + contentWidth - badgeWidth - 4, currentY + 5.5)
      }

      currentY += 11

      // Activities
      if (activities.length === 0) {
        checkPageBreak(10)
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(8.5)
        doc.setTextColor(96, 113, 106)
        doc.text('No specific activities scheduled for this day.', margin + 4, currentY + 4)
        currentY += 8
      } else {
        activities.forEach((activity, actIndex) => {
          const stopNumber = actIndex + 1
          const actTitle = sanitizeText(activity.title || activity.name || `Activity ${stopNumber}`)
          const actTime = sanitizeText(activity.time || 'Flexible timing')
          const actCategory = sanitizeText(activity.category || 'Sightseeing')
          const actCost = sanitizeText(activity.estimated_cost ?? activity.cost ?? activity.price ?? 'Free')
          const actDesc = sanitizeText(activity.description || '')
          const locationQuery = sanitizeText(
            activity.title && destination ? `${activity.title}, ${destination}` : destination || ''
          )

          // Calculate activity box dimensions
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          const descLines = actDesc ? doc.splitTextToSize(actDesc, contentWidth - 14) : []
          const descHeight = descLines.length * 3.6

          // Base height: title row (5) + meta tags row (4.5) + desc + location row (4.5) + padding (7)
          const actCardHeight = 16 + descHeight + (locationQuery ? 4.5 : 0)

          checkPageBreak(actCardHeight + 3)

          // Card Background
          doc.setFillColor(248, 249, 248)
          doc.setDrawColor(228, 234, 230)
          doc.roundedRect(margin, currentY, contentWidth, actCardHeight, 2, 2, 'FD')

          // Stop indicator pill on left
          doc.setFillColor(27, 89, 71)
          doc.roundedRect(margin + 3, currentY + 3, 13, 5, 1, 1, 'F')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(7)
          doc.setTextColor(255, 255, 255)
          doc.text(`Stop ${stopNumber}`, margin + 4.2, currentY + 6.6)

          // Title
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(9.5)
          doc.setTextColor(24, 53, 47)
          doc.text(actTitle, margin + 18, currentY + 6.8)

          // Timing on top right
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          doc.setTextColor(96, 113, 106)
          const timeWidth = doc.getTextWidth(actTime)
          doc.text(actTime, margin + contentWidth - timeWidth - 4, currentY + 6.8)

          // Meta Row: Category & Cost
          let metaY = currentY + 11.5
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(7.5)
          doc.setTextColor(27, 89, 71)
          doc.text(`Category: ${actCategory}`, margin + 4, metaY)

          const costText = `Cost: ${actCost}`
          const costWidth = doc.getTextWidth(costText)
          doc.setTextColor(180, 83, 9) // Amber
          doc.text(costText, margin + contentWidth - costWidth - 4, metaY)

          // Description
          let nextY = metaY + 4
          if (descLines.length > 0) {
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(8)
            doc.setTextColor(55, 65, 81)
            doc.text(descLines, margin + 4, nextY)
            nextY += descHeight
          }

          // Location
          if (locationQuery) {
            doc.setFont('helvetica', 'italic')
            doc.setFontSize(7.5)
            doc.setTextColor(100, 116, 139)
            doc.text(`Location: ${locationQuery}`, margin + 4, nextY + 1)
          }

          currentY += actCardHeight + 3
        })
      }

      currentY += 4 // Spacing between days
    })
  }

  // -------------------------------------------------------------
  // 5. FOOTER ON EVERY PAGE (Page X of Y & Branding)
  // -------------------------------------------------------------
  const totalPages = doc.getNumberOfPages()
  const now = new Date()
  const exportDateStr = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)

    // Footer divider line
    doc.setDrawColor(220, 228, 224)
    doc.setLineWidth(0.3)
    doc.line(margin, pageHeight - 12, margin + contentWidth, pageHeight - 12)

    // Left branding
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(120, 135, 128)
    doc.text(
      `TravelMate — Personalized Travel Itinerary  |  Exported on ${exportDateStr}`,
      margin,
      pageHeight - 7.5
    )

    // Right page numbering
    const pageStr = `Page ${i} of ${totalPages}`
    const pageStrWidth = doc.getTextWidth(pageStr)
    doc.text(pageStr, margin + contentWidth - pageStrWidth, pageHeight - 7.5)
  }

  // -------------------------------------------------------------
  // 6. SAVE PDF FILE
  // -------------------------------------------------------------
  const sanitizedDest = destination.toLowerCase().replace(/[^a-z0-9]+/g, '_')
  const filename = `${sanitizedDest || 'travel'}_itinerary.pdf`
  doc.save(filename)

  return filename
}
