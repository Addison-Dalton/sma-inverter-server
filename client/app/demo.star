load("render.star", "render")

# Mock data for demonstration
def getMockStats():
    return {
        "date": "2026-02-16",
        "currentWatts": 1234,
        "totalYieldWh": 18517,
        "totalYieldKwh": "18.5",
        "peakWatts": 4200,
        "peakTime": "13:15",
        "hourlyData": [
            {"hour": 8, "avgWatts": 450, "maxWatts": 600},
            {"hour": 9, "avgWatts": 1200, "maxWatts": 1450},
            {"hour": 10, "avgWatts": 2100, "maxWatts": 2400},
            {"hour": 11, "avgWatts": 3200, "maxWatts": 3600},
            {"hour": 12, "avgWatts": 3900, "maxWatts": 4200},
            {"hour": 13, "avgWatts": 4000, "maxWatts": 4200},
            {"hour": 14, "avgWatts": 3800, "maxWatts": 4100},
            {"hour": 15, "avgWatts": 3200, "maxWatts": 3500},
            {"hour": 16, "avgWatts": 2400, "maxWatts": 2700},
            {"hour": 17, "avgWatts": 1600, "maxWatts": 1800},
            {"hour": 18, "avgWatts": 900, "maxWatts": 1100},
            {"hour": 19, "avgWatts": 400, "maxWatts": 500},
            {"hour": 20, "avgWatts": 100, "maxWatts": 150},
        ],
    }

def main():
    stats = getMockStats()

    return render.Root(
        delay = 600,
        child = render.Column(
            children = [
                renderTopRow(stats),
                render.Box(height = 2),  # Small spacer
                renderGraph(stats),
            ],
        ),
    )

def renderTopRow(stats):
    watts = stats["currentWatts"]
    kwhStr = stats.get("totalYieldKwh", "0")

    # Color based on generation level
    wattsColor = getWattColor(watts)

    # Format current watts - use kW for larger values
    if watts >= 10000:
        wattsText = "%dkw" % int(watts / 1000)  # "10kw", "15kw"
    elif watts >= 1000:
        # Convert to kW with one decimal: 1234 -> "1.2kw"
        kw = int(watts / 100) / 10.0  # Divide by 100, then by 10 = watts/1000 with 1 decimal
        kwInt = int(kw * 10)  # 1.2 -> 12
        wattsText = "%d.%dkw" % (kwInt / 10, kwInt % 10)
    else:
        wattsText = "%dw" % watts  # "450w"

    # Format kWh display - use string directly (Starlark doesn't support %.1f)
    kwhText = "%sk" % kwhStr

    return render.Row(
        expanded = True,
        main_align = "space_between",
        cross_align = "center",
        children = [
            render.Text(wattsText, font = "6x13", color = wattsColor),
            render.Text(kwhText, font = "6x13", color = "#FFD700"),
        ],
    )

def renderGraph(stats):
    hourlyData = stats.get("hourlyData", [])

    if len(hourlyData) == 0:
        return render.Box(
            width = 64,
            height = 18,
            child = render.Text("No data", font = "tom-thumb", color = "#666"),
        )

    # Find max watts for scaling
    maxWatts = 0
    for hour in hourlyData:
        if hour.get("maxWatts", 0) > maxWatts:
            maxWatts = hour["maxWatts"]

    if maxWatts == 0:
        maxWatts = 1  # Avoid division by zero

    # Calculate bar width - we have up to 14 hours (8 AM to 9 PM)
    # With 64 pixels and some padding, use ~4 pixels per bar
    barWidth = 4
    graphHeight = 18

    bars = []
    for hour in hourlyData:
        avgWatts = hour.get("avgWatts", 0)

        # Scale bar height (0 to graphHeight pixels)
        barHeight = int((avgWatts / maxWatts) * graphHeight)
        if barHeight < 1 and avgWatts > 0:
            barHeight = 1  # Show at least 1 pixel if generating

        # Create spacer to push bar to bottom
        spacerHeight = graphHeight - barHeight

        bars.append(
            render.Column(
                main_align = "end",
                cross_align = "center",
                children = [
                    render.Box(width = barWidth, height = spacerHeight),
                    render.Box(
                        width = barWidth - 1,  # Leave 1px gap between bars
                        height = barHeight,
                        color = "#FFD700",  # Golden color
                    ),
                ],
            ),
        )

    return render.Box(
        width = 64,
        height = graphHeight,
        child = render.Row(
            main_align = "start",
            cross_align = "end",
            children = bars,
        ),
    )

def getWattColor(watts):
    """Return color based on generation level"""
    if watts > 2000:
        return "#00FF00"  # Green - high generation
    elif watts > 500:
        return "#FFFF00"  # Yellow - moderate
    elif watts > 0:
        return "#FFA500"  # Orange - low
    else:
        return "#666666"  # Dim - nighttime
