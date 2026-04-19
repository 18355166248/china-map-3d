// 批量下载各省城市级 GeoJSON 数据
// 来源：https://geo.datav.aliyun.com/areas_v3/bound/{adcode}_full.json
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../public/json');

const PROVINCES = [
  110000, 120000, 130000, 140000, 150000,
  210000, 220000, 230000,
  310000, 320000, 330000, 340000, 350000, 360000, 370000,
  410000, 420000, 430000, 440000, 450000, 460000,
  500000, 510000, 520000, 530000, 540000,
  610000, 620000, 630000, 640000, 650000,
  710000, 810000, 820000,
];

async function download(adcode) {
  const url = `https://geo.datav.aliyun.com/areas_v3/bound/${adcode}_full.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${adcode}`);
  return res.json();
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  let ok = 0, fail = 0;

  for (const adcode of PROVINCES) {
    const dest = join(OUT_DIR, `${adcode}-city.json`);
    try {
      const data = await download(adcode);
      writeFileSync(dest, JSON.stringify(data));
      console.log(`✓ ${adcode}`);
      ok++;
    } catch (e) {
      console.error(`✗ ${adcode}: ${e.message}`);
      fail++;
    }
    // 避免请求过快被限流
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\n完成：${ok} 成功，${fail} 失败`);
}

main();
