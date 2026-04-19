// 批量下载各城市的县级 GeoJSON 数据
// 从已有的 {province}-city.json 中提取城市 adcode，再下载对应的 _full.json
import { writeFileSync, readFileSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_DIR = join(__dirname, '../public/json');

async function download(adcode) {
  const url = `https://geo.datav.aliyun.com/areas_v3/bound/${adcode}_full.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function main() {
  mkdirSync(JSON_DIR, { recursive: true });

  // 从所有 *-city.json 中收集城市 adcode
  const cityFiles = readdirSync(JSON_DIR).filter(f => f.endsWith('-city.json'));
  const cityAdcodes = [];
  for (const file of cityFiles) {
    const data = JSON.parse(readFileSync(join(JSON_DIR, file), 'utf-8'));
    for (const feature of data.features ?? []) {
      const adcode = feature.properties?.adcode;
      if (adcode && typeof adcode === 'number') cityAdcodes.push(adcode);
    }
  }

  console.log(`共 ${cityAdcodes.length} 个城市，开始下载县级数据...\n`);

  let ok = 0, fail = 0, skip = 0;
  for (const adcode of cityAdcodes) {
    const dest = join(JSON_DIR, `${adcode}-county.json`);
    try {
      const data = await download(adcode);
      // 没有子级数据（features 为空）则跳过，不写文件
      if (!data.features?.length) { skip++; continue; }
      writeFileSync(dest, JSON.stringify(data));
      process.stdout.write(`✓ ${adcode}  `);
      ok++;
    } catch (e) {
      process.stdout.write(`✗ ${adcode}  `);
      fail++;
    }
    await new Promise(r => setTimeout(r, 80));
  }

  console.log(`\n\n完成：${ok} 成功，${fail} 失败，${skip} 无子级跳过`);
}

main();
