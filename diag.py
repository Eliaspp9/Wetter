import urllib.request
b=urllib.request.urlopen(urllib.request.Request("https://www.rainviewer.com/files/rainviewer_api_colors_table.csv",headers={"User-Agent":"diag"}),timeout=25).read().decode().splitlines()
rows=[l.split(",") for l in b[1:]]
print("N",len(rows))
half=len(rows)//2
for name,part in [("RAIN",rows[:half]),("SNOW",rows[half:])]:
    print(name, " ".join(f"{r[0]}:{r[3]}" for r in part if -10<=int(r[0])<=80))
