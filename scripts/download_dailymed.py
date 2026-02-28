import os
import requests
import sys
import argparse
from urllib.parse import urljoin

class DailyMedDownloader:
    BASE_URL = "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/download/"
    
    # Pre-defined file structures based on DailyMed patterns
    FILES = {
        'prescription': [f"dm_spl_release_human_rx_part{i}.zip" for i in range(1, 7)],
        'otc': [f"dm_spl_release_human_otc_part{i}.zip" for i in range(1, 12)],
        # Weekly updates usually follow a date pattern, we'll allow passing a specific one or common recent ones
        'weekly': [
            "dm_spl_weekly_update_021626_022026.zip",
            "dm_spl_weekly_update_020926_021326.zip",
            "dm_spl_weekly_update_020226_020626.zip"
        ]
    }

    def __init__(self, output_dir="data/downloads/dailymed"):
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)

    def download_file(self, filename):
        url = urljoin(self.BASE_URL, filename)
        target_path = os.path.join(self.output_dir, filename)

        if os.path.exists(target_path):
            print(f"Skipping {filename}: Already exists.")
            return True

        print(f"Downloading {filename}...")
        try:
            with requests.get(url, stream=True, timeout=30) as r:
                r.raise_for_status()
                total_size = int(r.headers.get('content-length', 0))
                
                with open(target_path, 'wb') as f:
                    downloaded = 0
                    for chunk in r.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)
                            self.show_progress(downloaded, total_size, filename)
            print(f"
Successfully downloaded {filename}")
            return True
        except Exception as e:
            print(f"
Error downloading {filename}: {e}")
            if os.path.exists(target_path):
                os.remove(target_path)
            return False

    def show_progress(self, current, total, filename):
        if total <= 0:
            sys.stdout.write(f"Downloading... {current} bytes")
        else:
            percent = (current / total) * 100
            bar_length = 40
            filled_length = int(bar_length * current // total)
            bar = '█' * filled_length + '-' * (bar_length - filled_length)
            sys.stdout.write(f"|{bar}| {percent:.1f}% ({current // 1024 // 1024} MB / {total // 1024 // 1024} MB)")
        sys.stdout.flush()

    def run(self, category):
        files_to_download = []
        if category == 'all':
            for cat in self.FILES:
                files_to_download.extend(self.FILES[cat])
        elif category in self.FILES:
            files_to_download = self.FILES[category]
        else:
            print(f"Unknown category: {category}")
            return

        print(f"Starting download for category: {category} ({len(files_to_download)} files)")
        for fname in files_to_download:
            self.download_file(fname)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download bulk SPL ZIPs from DailyMed.")
    parser.add_argument("--category", choices=['prescription', 'otc', 'weekly', 'all'], default='weekly', 
                        help="Which set of files to download (default: weekly)")
    parser.add_argument("--out", default="data/downloads/dailymed", help="Output directory")
    
    args = parser.parse_args()
    
    downloader = DailyMedDownloader(output_dir=args.out)
    downloader.run(args.category)
