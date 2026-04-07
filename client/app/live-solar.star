load("render.star", "render")
load("http.star", "http")
load("cache.star", "cache")
load("encoding/json.star", "json")

SERVER_PORT = "3005"
INVERTER_DOCKER_SERVER_HOST = "http://host.docker.internal:" + SERVER_PORT
INVERTER_STATS_ENDPOINT = INVERTER_DOCKER_SERVER_HOST + "/api/daily/stats"
STATS_CACHE_KEY = "daily_stats"

def main():
    stats = getDailyStats()

    if stats == None or stats.get("currentWatts") == None:
        return render.Root(
            child = render.Box(
                child = render.Text("Loading...", font = "tom-thumb"),
            ),
        )

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

    # Build hour -> data lookup so we can fill all time slots
    hourMap = {}
    for h in hourlyData:
        hourMap[h.get("hour")] = h

    # Find max watts across all hours for scaling
    maxWatts = 0
    for h in hourlyData:
        if h.get("maxWatts", 0) > maxWatts:
            maxWatts = h["maxWatts"]
    if maxWatts == 0:
        maxWatts = 1  # Avoid division by zero

    barWidth = 4
    graphHeight = 18

    # Always render all hours 8am-9pm as fixed time positions (left = morning, right = evening)
    bars = []
    for h in range(8, 22):
        hourData = hourMap.get(h, {})
        avgWatts = hourData.get("avgWatts", 0)

        barHeight = int((avgWatts / maxWatts) * graphHeight)
        if barHeight < 1 and avgWatts > 0:
            barHeight = 1

        spacerHeight = graphHeight - barHeight

        bar_children = [render.Box(width = barWidth, height = spacerHeight)]
        if barHeight > 0:
            bar_children.append(render.Box(
                width = barWidth - 1,
                height = barHeight,
                color = "#FFD700",
            ))

        bars.append(render.Column(
            main_align = "end",
            cross_align = "center",
            children = bar_children,
        ))

    return render.Row(
        expanded = True,
        main_align = "start",
        cross_align = "end",
        children = bars,
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

def getDailyStats():
    """Fetch daily stats with caching"""
    cached = cache.get(STATS_CACHE_KEY)
    if cached != None:
        print("Cache hit! Using cached stats")
        return json.decode(cached)

    stats = fetchDailyStats()
    if stats != None:
        cache.set(STATS_CACHE_KEY, json.encode(stats), ttl_seconds = 60)
    return stats

def fetchDailyStats():
    """Fetch daily statistics from server"""
    print("Fetching daily stats from: " + INVERTER_STATS_ENDPOINT)

    rep = http.get(INVERTER_STATS_ENDPOINT, ttl_seconds = 30)

    if rep.status_code != 200:
        print("Request failed with status %d" % rep.status_code)
        # Try to return cached data even if expired
        return cache.get(STATS_CACHE_KEY)

    return rep.json()
