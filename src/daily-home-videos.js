// ./src/daily-home-videos.js - 简化版本
import fetch from 'node-fetch';
import { executeSQL, checkEnv } from './db.js';
import { saveVideoData } from './migu-api.js';

// 从官方API获取首页推荐视频
async function fetchHomeVideos() {
  const url = 'https://jadeite.migu.cn/search/v3/category';
  
  try {
    console.log('🔗 获取首页推荐视频...');
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://www.miguvideo.com',
        'Referer': 'https://www.miguvideo.com/',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      timeout: 10000
    });
    
    if (!response.ok) {
      console.log(`❌ HTTP 错误: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    if (data.code !== 200 || !data.body || !data.body.data) {
      console.log(`❌ API错误: ${data.message || '无数据'}`);
      return [];
    }
    
    console.log(`✅ 获取首页推荐视频成功: ${data.body.data.length} 个视频`);
    return data.body.data;
  } catch (error) {
    console.error('❌ 获取首页推荐视频失败:', error.message);
    return [];
  }
}

// 获取高质量图片
function getHighQualityPic(item) {
  const pics = item.pics || {};
  return pics.highResolutionV || pics.lowResolutionV || pics.highResolutionH || pics.lowResolutionH || '';
}

// 构建备注信息
function buildRemarks(item) {
  const remarks = [];
  if (item.updateEP) remarks.push(item.updateEP);
  if (item.score) remarks.push(`评分:${item.score}`);
  if (item.year) remarks.push(item.year);
  return remarks.length > 0 ? remarks.join(' | ') : '未知';
}

// 清除表中原有数据
async function clearHomeVideos() {
  try {
    console.log('🗑️  清除首页视频表原有数据...');
    await executeSQL('DELETE FROM home_videos');
    console.log('✅ 清除数据成功');
    return true;
  } catch (error) {
    console.error('❌ 清除数据失败:', error);
    return false;
  }
}

// 保存首页视频到表
async function saveHomeVideo(item, index) {
  try {
    const picUrl = getHighQualityPic(item);
    const remarks = buildRemarks(item);
    
    await executeSQL(`
      INSERT INTO home_videos 
      (p_id, name, pic_url, vod_remarks, sort_order) 
      VALUES (?, ?, ?, ?, ?)
    `, [
      item.pID || '',
      item.name || '未知',
      picUrl,
      remarks,
      index
    ]);
    
    console.log(`✅ 保存首页视频 [${index + 1}]: ${item.name}`);
    return true;
  } catch (error) {
    console.error(`❌ 保存首页视频失败 ${item.name}:`, error.message);
    return false;
  }
}

// 🔥 直接使用 migu-api.js 的保存逻辑
async function saveFullVideoData(videoData) {
  try {
    const contDisplayType = videoData.contDisplayType || '';
    if (!contDisplayType) {
      console.log(`⚠️ 跳过视频 ${videoData.name}: 无分类信息`);
      return false;
    }
    
    const videoId = videoData.pID;
    if (!videoId) {
      console.log(`⚠️ 跳过视频 ${videoData.name}: 无视频ID`);
      return false;
    }
    
    // 直接调用 migu-api.js 的保存逻辑
    const success = await saveVideoData(videoData, contDisplayType);
    
    if (success) {
      console.log(`✅ [首页] 视频保存成功: ${videoData.name}`);
    } else {
      console.log(`❌ [首页] 视频保存失败: ${videoData.name}`);
    }
    
    return success;
  } catch (error) {
    console.error(`❌ [首页] 保存完整视频失败 ${videoData.name}:`, error.message);
    return false;
  }
}

// 主函数：每日更新首页推荐视频和完整视频信息
async function dailyUpdateHomeVideos() {
  checkEnv();
  
  const currentTime = new Date().toLocaleString('zh-CN');
  console.log(`🚀 开始每日更新首页推荐视频和完整信息 - ${currentTime}`);
  
  // 获取首页视频数据
  const videos = await fetchHomeVideos();
  
  if (videos.length === 0) {
    console.log('❌ 没有获取到首页视频数据，任务终止');
    return false;
  }
  
  // 清除表中原有数据
  const clearSuccess = await clearHomeVideos();
  if (!clearSuccess) {
    console.log('❌ 清除数据失败，任务终止');
    return false;
  }
  
  let homeSuccessCount = 0;
  let homeFailCount = 0;
  let fullSuccessCount = 0;
  let fullFailCount = 0;
  
  // 保存所有视频（最多20个）
  const maxVideos = Math.min(videos.length, 20);
  console.log(`📋 准备处理 ${maxVideos} 个视频`);
  
  for (let i = 0; i < maxVideos; i++) {
    const video = videos[i];
    
    console.log(`\n--- 处理第 ${i + 1} 个视频: ${video.name} ---`);
    
    // 1. 保存到首页视频表
    const homeSuccess = await saveHomeVideo(video, i);
    if (homeSuccess) {
      homeSuccessCount++;
    } else {
      homeFailCount++;
    }
    
    // 2. 🔥 直接使用 migu-api.js 的保存逻辑
    const fullSuccess = await saveFullVideoData(video);
    if (fullSuccess) {
      fullSuccessCount++;
    } else {
      fullFailCount++;
    }
  }
  
  console.log(`\n🎊 每日更新完成!`);
  console.log(`📊 首页视频表: 成功 ${homeSuccessCount} 个, 失败 ${homeFailCount} 个`);
  console.log(`📊 完整视频信息: 成功 ${fullSuccessCount} 个, 失败 ${fullFailCount} 个`);
  
  const homeResult = await executeSQL('SELECT COUNT(*) as count FROM home_videos');
  const homeCount = homeResult?.result?.[0]?.results?.[0]?.count || 0;
  
  const videoResult = await executeSQL('SELECT COUNT(*) as count FROM videos');
  const videoCount = videoResult?.result?.[0]?.results?.[0]?.count || 0;
  
  console.log(`\n📈 数据库统计: 首页视频 ${homeCount} 个, 主视频 ${videoCount} 个`);
  console.log(`⏰ 下次更新: 明天 03:00`);
  
  return homeSuccessCount > 0;
}

// 导出函数供其他模块使用
export { dailyUpdateHomeVideos };

// 如果直接运行此文件，则执行更新
if (import.meta.url === `file://${process.argv[1]}`) {
  dailyUpdateHomeVideos().catch(console.error);
}
