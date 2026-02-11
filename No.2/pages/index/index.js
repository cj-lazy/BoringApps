// index.js
var defaultThemes = [
  { name: "今天吃什么", icon: "🍔", verb: "吃", items: [{name:"火锅", weight:1}, {name:"烧烤", weight:1}, {name:"麻辣烫", weight:1}, {name:"轻食", weight:1}, {name:"日料", weight:1}, {name:"螺蛳粉", weight:1}] },
  // 🔥 修改点：图标改为 🎡
  { name: "周末去哪玩", icon: "🎡", verb: "去", items: [{name:"看电影", weight:1}, {name:"逛公园", weight:1}, {name:"宅家里", weight:1}, {name:"去爬山", weight:1}, {name:"博物馆", weight:1}] },
  { name: "谁去拿外卖", icon: "🥡", verb: "坑", items: [{name:"我去", weight:1}, {name:"你去", weight:1}, {name:"石头剪刀布", weight:1}, {name:"老板去", weight:1}] }
];

Page({
  data: {
    themes: [],
    currentThemeIndex: 0,
    currentTheme: {},
    displayItem: "???",
    
    isRunning: false,
    timer: null,
    autoTimer: null,
    showMenu: false,
    isEditMode: false,
    isGuest: false,

    history: [],
    showStats: false,
    statsData: [],
    topPick: null, 

    inputValue: "",
    newThemeName: "",
    newThemeVerb: ""
  },

  onLoad: function(options) {
    var that = this;
    if (options.sharedData) {
      try {
        var sharedTheme = JSON.parse(decodeURIComponent(options.sharedData));
        this.normalizeThemeItems(sharedTheme);
        this.setData({ currentTheme: sharedTheme, isGuest: true, displayItem: "???" });
        var savedHistory = wx.getStorageSync('myDecisionHistory') || [];
        this.setData({ history: savedHistory });
        this.updateStats();
        return; 
      } catch (e) { console.error("解析失败", e); }
    }
    var savedThemes = wx.getStorageSync('myDecisionThemes');
    if (!savedThemes || savedThemes.length === 0) savedThemes = defaultThemes;
    savedThemes.forEach(function(theme) { that.normalizeThemeItems(theme); });
    var savedHistory = wx.getStorageSync('myDecisionHistory') || [];
    this.setData({ themes: savedThemes, history: savedHistory });
    this.refreshCurrentTheme();
    this.updateStats();
    setTimeout(function(){ that.initShake(); }, 500);
  },

  normalizeThemeItems: function(theme) {
    if (!theme.items) return;
    theme.items = theme.items.map(function(item) {
      if (typeof item === 'string') return { name: item, weight: 1 };
      if (!item.weight || item.weight < 1) item.weight = 1;
      return item;
    });
  },

  initShake: function() {
    var that = this;
    try {
      wx.startAccelerometer({ interval: 'ui' });
      wx.onAccelerometerChange(function(res) {
        if (that.data.isEditMode || that.data.showMenu || that.data.showStats) return;
        if (Math.abs(res.x) > 1.2 || Math.abs(res.y) > 1.2) {
          if (!that.data.isRunning) {
            that.start();
            that.data.autoTimer = setTimeout(function() { 
              if(that.data.isRunning) that.stop(); 
            }, 1500);
          }
        }
      });
    } catch (e) {}
  },

  refreshCurrentTheme: function() {
    var that = this;
    this.setData({ 
      currentTheme: this.data.themes[this.data.currentThemeIndex],
      displayItem: "???"
    }, function() { that.updateStats(); });
  },

  manualToggle: function() {
    var that = this;
    if (this.data.isRunning) {
      this.stop();
    } else {
      this.start();
      this.data.autoTimer = setTimeout(function() { 
        if(that.data.isRunning) that.stop(); 
      }, 1500);
    }
  },

  start: function() {
    var list = this.data.currentTheme.items;
    if (!list || list.length === 0) return wx.showToast({ title: '菜单是空的！', icon:'none'});
    if (this.data.autoTimer) clearTimeout(this.data.autoTimer);
    this.setData({ isRunning: true });
    var that = this;
    this.data.timer = setInterval(function() {
      var r = Math.floor(Math.random() * list.length);
      that.setData({ displayItem: list[r].name });
    }, 50);
  },

  stop: function() {
    clearInterval(this.data.timer);
    if (this.data.autoTimer) clearTimeout(this.data.autoTimer);
    this.setData({ isRunning: false });
    var list = this.data.currentTheme.items;
    var finalItemName = this.getWeightedResult(list);
    this.setData({ displayItem: finalItemName });
    wx.vibrateShort({ type: 'light' }); 
    var now = new Date().getTime();
    var newRecord = { theme: this.data.currentTheme.name, item: finalItemName, timestamp: now };
    var newHistory = [newRecord, ...this.data.history].slice(0, 500);
    this.setData({ history: newHistory });
    wx.setStorageSync('myDecisionHistory', newHistory);
    this.updateStats();
  },

  getWeightedResult: function(list) {
    var totalWeight = 0;
    list.forEach(function(item) { totalWeight += (item.weight || 1); });
    var random = Math.random() * totalWeight;
    var currentSum = 0;
    for (var i = 0; i < list.length; i++) {
      currentSum += (list[i].weight || 1);
      if (random < currentSum) return list[i].name;
    }
    return list[0].name;
  },

  clearHistory: function() {
    var that = this;
    wx.showModal({
      title: '确认清空',
      content: '确定要清空【' + this.data.currentTheme.name + '】的所有历史记录吗？',
      confirmColor: '#ff4d4f',
      success: function(res) {
        if (res.confirm) {
          var newHistory = that.data.history.filter(function(h) {
            return h.theme !== that.data.currentTheme.name;
          });
          that.setData({ history: newHistory }, function() {
            wx.setStorageSync('myDecisionHistory', newHistory);
            that.updateStats(); 
            wx.showToast({ title: '已清空', icon: 'success' });
          });
        }
      }
    });
  },

  updateStats: function() {
    var themeName = this.data.currentTheme.name;
    var relevantHistory = this.data.history.filter(function(h) { return h.theme === themeName; });
    if (relevantHistory.length === 0) { this.setData({ topPick: null, statsData: [] }); return; }
    var counts = {};
    relevantHistory.forEach(function(h) { counts[h.item] = (counts[h.item] || 0) + 1; });
    var sortedStats = Object.keys(counts).map(function(key) { 
      return { name: key, count: counts[key] }; 
    }).sort(function(a, b) { return b.count - a.count; });
    var top = sortedStats[0];
    var max = top ? top.count : 1;
    sortedStats = sortedStats.map(function(item) { item.percent = (item.count / max) * 100; return item; });
    this.setData({ statsData: sortedStats, topPick: top, currentVerb: this.data.currentTheme.verb || "选" });
  },

  changeWeight: function(e) {
    var itemIdx = e.currentTarget.dataset.index;
    var themeIdx = this.data.currentThemeIndex;
    var that = this;
    wx.showActionSheet({
      itemList: ['⭐ 1倍 (普通)', '⭐⭐ 2倍', '⭐⭐⭐ 3倍', '⭐⭐⭐⭐ 4倍', '⭐⭐⭐⭐⭐ 5倍'],
      success: function(res) {
        var newWeight = res.tapIndex + 1;
        var key = 'themes[' + themeIdx + '].items[' + itemIdx + '].weight';
        var updateData = {}; updateData[key] = newWeight;
        that.setData(updateData, function() { that.refreshCurrentTheme(); that.save(); });
      }
    });
  },

  addItem: function() {
    var val = this.data.inputValue.trim(); 
    if (!val) return;
    var idx = this.data.currentThemeIndex; 
    var currentList = this.data.themes[idx].items;
    var exists = currentList.some(function(item) { return item.name === val; });
    if (exists) { wx.vibrateShort({ type: 'medium' }); return wx.showToast({ title: '已存在', icon: 'none' }); }
    var key = 'themes[' + idx + '].items';
    var updateData = {}; updateData[key] = [{name: val, weight: 1}].concat(currentList); updateData['inputValue'] = "";
    this.setData(updateData); this.refreshCurrentTheme(); this.save();
  },

  onShareAppMessage: function() { 
    var t = this.data.currentTheme; 
    return { title: '帮我选一下：' + t.name, path: '/pages/index/index?sharedData=' + encodeURIComponent(JSON.stringify(t)) }; 
  },
  
  saveSharedTheme: function() {
    var my = wx.getStorageSync('myDecisionThemes') || JSON.parse(JSON.stringify(defaultThemes));
    var that = this;
    if (my.some(function(t) { return t.name === that.data.currentTheme.name; })) return wx.showToast({ title: '已存在', icon: 'none' });
    my.push(this.data.currentTheme); wx.setStorageSync('myDecisionThemes', my); wx.showToast({ title: '保存成功', icon: 'success' });
    this.setData({ isGuest: false, themes: my, currentThemeIndex: my.length - 1 }, function() { that.updateStats(); });
  },
  toggleMenu: function() { if(!this.data.isGuest) this.setData({ showMenu: !this.data.showMenu }); },
  toggleEdit: function() { this.setData({ isEditMode: !this.data.isEditMode }); },
  stopBubble: function() {},
  switchTheme: function(e) { var idx = e.currentTarget.dataset.index; this.setData({ currentThemeIndex: idx, showMenu: false }, function() { this.refreshCurrentTheme(); }); },
  addNewTheme: function() {
    var n = this.data.newThemeName.trim(); if (!n) return wx.showToast({ title: '名字空', icon: 'none' });;
    var list = this.data.themes; list.push({ name: n, icon: '✨', verb: this.data.newThemeVerb.trim() || "选", items: [] });
    this.setData({ themes: list, newThemeName: "", newThemeVerb: "" }); this.save(); wx.showToast({ title: '添加成功', icon: 'success' });
  },
  deleteTheme: function() {
    var that = this;
    wx.showModal({ title: '警报', content: '确定删除吗？', success: function(res) { 
      if (res.confirm) {
        var list = that.data.themes; list.splice(that.data.currentThemeIndex, 1);
        if (list.length === 0) list = JSON.parse(JSON.stringify(defaultThemes));
        that.setData({ themes: list, currentThemeIndex: 0, isEditMode: false }, function() { that.refreshCurrentTheme(); that.save(); });
      }
    }});
  },
  onInput: function(e) { this.setData({ inputValue: e.detail.value }); },
  onThemeInput: function(e) { this.setData({ newThemeName: e.detail.value }); },
  onThemeVerbInput: function(e) { this.setData({ newThemeVerb: e.detail.value }); },
  deleteItem: function(e) {
    var itemIdx = e.currentTarget.dataset.index; var themeIdx = this.data.currentThemeIndex; var list = this.data.themes[themeIdx].items;
    list.splice(itemIdx, 1); var key = 'themes[' + themeIdx + '].items'; var update = {}; update[key] = list;
    this.setData(update); this.refreshCurrentTheme(); this.save();
  },
  showStatsModal: function() { this.updateStats(); if (!this.data.topPick) return wx.showToast({ title: '暂无数据', icon: 'none' }); this.setData({ showStats: true }); },
  closeStats: function() { this.setData({ showStats: false }); },
  save: function() { wx.setStorageSync('myDecisionThemes', this.data.themes); },
  onUnload: function() { wx.stopAccelerometer(); }
});