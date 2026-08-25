/* ============================================================
   EDI 供应链协同平台 — 交互脚本
   1. 物流航线地图渲染 + 悬停放大
   2. 滚动入场动画（IntersectionObserver）
   3. 订单系统 Tab 切换 + AI 洞察打字机
   4. 物流按钮激活切换
   ============================================================ */

// JS 可用标记：加载失败时页面内容保持可见（仅无动画）
document.documentElement.classList.add('js');

/* ---------- 1. 物流航线地图 ---------- */
(function initWorldMap() {
  var container = document.getElementById('worldMap');
  if (!container) return;

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var activePort = null; // 当前悬停放大的港口

  function el(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) {
      if (attrs.hasOwnProperty(k)) node.setAttribute(k, attrs[k]);
    }
    return node;
  }

  /* 生成港口层 + 标签层（悬停变化时重建，不影响点阵/航线动画） */
  function renderPorts(portsLayer, labelsLayer, activeKey) {
    portsLayer.innerHTML = '';
    labelsLayer.innerHTML = '';

    Object.keys(PORTS).forEach(function (key) {
      var port = PORTS[key];
      var isHub = CHINA_HUBS.indexOf(key) !== -1;
      var isActive = activeKey === key;

      var g = el('g', { class: 'port-group', style: 'cursor:pointer' });
      var cx = port.x, cy = port.y;

      if (isHub) {
        // 中国枢纽港：蓝色脉冲光环
        var dot = el('circle', {
          cx: cx, cy: cy,
          r: isActive ? 11 : 6.5,
          fill: isActive ? '#2563eb' : '#3b82f6'
        });
        g.appendChild(dot);

        var halo = el('circle', {
          cx: cx, cy: cy,
          r: isActive ? 11 : 6.5,
          fill: 'none',
          stroke: isActive ? '#2563eb' : '#3b82f6',
          'stroke-width': 1.4
        });
        if (isActive) {
          halo.appendChild(el('animate', { attributeName: 'r', values: '11;34', dur: '1.6s', repeatCount: 'indefinite' }));
          halo.appendChild(el('animate', { attributeName: 'opacity', values: '0.8;0', dur: '1.6s', repeatCount: 'indefinite' }));
        } else {
          halo.appendChild(el('animate', { attributeName: 'r', values: '6.5;22', dur: '2.6s', repeatCount: 'indefinite' }));
          halo.appendChild(el('animate', { attributeName: 'opacity', values: '0.8;0', dur: '2.6s', repeatCount: 'indefinite' }));
        }
        g.appendChild(halo);
      } else {
        // 目的地港口：动态呼吸圆点
        var dot2 = el('circle', {
          cx: cx, cy: cy,
          r: isActive ? 10 : 6,
          fill: isActive ? '#2563eb' : '#3b82f6',
          opacity: 0.9
        });
        if (!isActive) {
          dot2.appendChild(el('animate', { attributeName: 'r', values: '6;8.5;6', dur: '2.2s', repeatCount: 'indefinite' }));
        }
        g.appendChild(dot2);

        var halo2 = el('circle', {
          cx: cx, cy: cy,
          r: isActive ? 10 : 11,
          fill: 'none',
          stroke: isActive ? '#2563eb' : '#60a5fa',
          'stroke-opacity': 0.5,
          'stroke-width': 1
        });
        if (isActive) {
          halo2.appendChild(el('animate', { attributeName: 'r', values: '10;30', dur: '1.4s', repeatCount: 'indefinite' }));
          halo2.appendChild(el('animate', { attributeName: 'opacity', values: '0.7;0', dur: '1.4s', repeatCount: 'indefinite' }));
        } else {
          halo2.appendChild(el('animate', { attributeName: 'r', values: '11;16;11', dur: '2.2s', repeatCount: 'indefinite' }));
        }
        g.appendChild(halo2);
      }

      // 悬停放大 / 移出恢复
      g.addEventListener('mouseenter', function () { setActive(key); });
      g.addEventListener('mouseleave', function () { setActive(null); });
      portsLayer.appendChild(g);

      // 标签
      if (port.label) {
        var text = el('text', {
          x: port.x + port.label.dx,
          y: port.y + port.label.dy,
          'font-size': isActive ? 19 : 16,
          'font-weight': isActive ? 700 : 500,
          fill: isActive ? '#2563eb' : '#475569',
          'text-anchor': port.label.anchor,
          style: 'user-select:none;cursor:pointer'
        });
        text.textContent = port.name;
        text.addEventListener('mouseenter', function () { setActive(key); });
        text.addEventListener('mouseleave', function () { setActive(null); });
        labelsLayer.appendChild(text);
      }
    });
  }

  function setActive(key) {
    if (activePort === key) return;
    activePort = key;
    var svg = container.querySelector('svg');
    if (!svg) return;
    renderPorts(
      svg.querySelector('#portsLayer'),
      svg.querySelector('#labelsLayer'),
      key
    );
  }

  /* 构建完整 SVG */
  var svg = el('svg', {
    viewBox: '0 0 ' + MAP_WIDTH + ' ' + MAP_HEIGHT,
    class: 'world-map',
    role: 'img',
    'aria-label': '全球物流航线网络地图'
  });

  // 渐变定义
  var defs = el('defs', {});
  var gradient = el('linearGradient', { id: 'routeGradient', x1: '0%', y1: '0%', x2: '100%', y2: '0%' });
  gradient.appendChild(el('stop', { offset: '0%', 'stop-color': '#2563eb' }));
  gradient.appendChild(el('stop', { offset: '100%', 'stop-color': '#60a5fa' }));
  defs.appendChild(gradient);
  svg.appendChild(defs);

  // 陆地点阵
  var dotsLayer = el('g', { class: 'dots-layer', opacity: 1 });
  MAP_DOTS.forEach(function (dot) {
    dotsLayer.appendChild(el('circle', {
      cx: dot[0], cy: dot[1], r: 3.1, fill: '#1e3a5f', opacity: 0.55
    }));
  });
  svg.appendChild(dotsLayer);

  // 航线弧线 + 流动光点
  var routesLayer = el('g', { class: 'routes-layer' });
  ROUTES.forEach(function (route, index) {
    var a = PORTS[route.from];
    var b = PORTS[route.to];
    var d = routePath(a, b, route.lift, route.bend);

    var path = el('path', {
      d: d,
      class: 'route-path',
      fill: 'none',
      stroke: 'url(#routeGradient)',
      'stroke-width': 1.5,
      'stroke-linecap': 'round',
      'stroke-opacity': 0.45,
      style: 'filter:drop-shadow(0 0 3px rgba(59,130,246,0.4))'
    });
    routesLayer.appendChild(path);

    // 沿航线移动的光点（货轮）
    var ship = el('circle', { r: 4.5, fill: '#3b82f6', opacity: 0.95 });
    var motion = el('animateMotion', {
      dur: route.dur + 's',
      repeatCount: 'indefinite',
      path: d,
      begin: (index * 0.5) + 's'
    });
    ship.appendChild(motion);
    routesLayer.appendChild(ship);
  });
  svg.appendChild(routesLayer);

  // 港口层 + 标签层（悬停时重建）
  var portsLayer = el('g', { id: 'portsLayer' });
  var labelsLayer = el('g', { id: 'labelsLayer' });
  renderPorts(portsLayer, labelsLayer, null);
  svg.appendChild(portsLayer);
  svg.appendChild(labelsLayer);

  container.appendChild(svg);

  /* 航线描线动效：初始隐藏，滑入视口时从无到有依次绘制 */
  var routePaths = container.querySelectorAll('.routes-layer path');
  var routeShips = container.querySelectorAll('.routes-layer circle');
  var routeCount = routePaths.length;

  routePaths.forEach(function (p) {
    var len = p.getTotalLength() || 600;
    p.style.strokeDasharray = len;
    p.style.strokeDashoffset = len; /* 初始完全隐藏 */
    p.style.transition = 'stroke-dashoffset 1.3s cubic-bezier(0.4, 0, 0.2, 1)';
  });
  routeShips.forEach(function (s) {
    s.style.opacity = 0;
    s.style.transition = 'opacity 0.5s ease';
  });

  function revealRoutes() {
    routePaths.forEach(function (p, i) {
      p.style.transitionDelay = (i * 0.1) + 's';
      p.style.strokeDashoffset = 0;
    });
    routeShips.forEach(function (s, i) {
      s.style.transitionDelay = (routeCount * 0.1 + i * 0.05) + 's';
      s.style.opacity = 0.95;
    });
  }

  if ('IntersectionObserver' in window) {
    var mapObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          revealRoutes();
          mapObserver.disconnect();
        }
      });
    }, { threshold: 0.25 });
    mapObserver.observe(container);
  } else {
    revealRoutes();
  }
})();

/* ---------- 2. 滚动入场动画 ---------- */
(function initReveal() {
  var items = document.querySelectorAll('.reveal, .stagger');
  if (!('IntersectionObserver' in window)) {
    items.forEach(function (item) { item.classList.add('in-view'); });
    return;
  }
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    });
  }, { rootMargin: '-80px 0px', threshold: 0.1 });

  items.forEach(function (item) { observer.observe(item); });
})();

/* ---------- 3. 订单系统 Tab + AI 洞察打字机 ---------- */
(function initOrderTabs() {
  var tabBtns = document.querySelectorAll('.tab-btn');
  if (!tabBtns.length) return;

  var TAB_DATA = {
    团餐: {
      title: '惠发云',
      features: ['全产业链覆盖', '深度产业赋能', '数字化与智能化', '精准数据分析智配库存与发货'],
      insights: [
        '今日订单量较昨日增长 15%，预计高峰时段 11:30-13:00',
        '智能推荐：建议增加牛肉类食材备货量，预测需求增长 22%',
        '异常预警：3 号仓库库存低于安全线，请及时补货'
      ]
    },
    流通: {
      title: '鲜麦',
      features: ['庞大的服务网络', '一站式采购平台', '技术驱动的智能履约', '供应链 + 系统 + 定制数字化管理'],
      insights: [
        '本周采购订单同比上涨 18%，华东区域需求最为旺盛',
        '智能调度：建议优化 7 条配送路线，预计节省运输成本 12%',
        '库存预警：鲜麦一站式平台 5 个品类库存周转率低于阈值'
      ]
    },
    海外: {
      title: '飞熊',
      features: ['庞大的交易规模', '全球化资源网络', '全链路产业服务', '数字化与生态化布局'],
      insights: [
        '本月跨境订单量突破 1200 单，东南亚市场增长显著',
        '汇率提醒：美元兑人民币波动较大，建议锁定远期汇率',
        '合规提示：3 批出口货物需补充原产地证书，请及时处理'
      ]
    }
  };

  var titleEl = document.getElementById('orderTitle');
  var featuresEl = document.getElementById('orderFeatures');
  var aiTextEl = document.getElementById('aiText');
  var typeTimer = null;

  /* AI 洞察打字机：打字 → 暂停 → 删除 → 下一条 */
  function startTypewriter(texts) {
    if (typeTimer) clearInterval(typeTimer);
    var textIndex = 0;
    var displayText = '';
    var isDeleting = false;
    var isPaused = false;
    var interval;

    function render() {
      aiTextEl.innerHTML = displayText + '<span class="ai-caret"></span>';
    }

    interval = setInterval(function () {
      var currentText = texts[textIndex];

      if (isPaused) {
        isPaused = false;
        isDeleting = true;
        return;
      }

      if (isDeleting) {
        if (displayText === '') {
          isDeleting = false;
          textIndex = (textIndex + 1) % texts.length;
          return;
        }
        displayText = currentText.substring(0, displayText.length - 1);
        render();
      } else {
        if (displayText === currentText) {
          isPaused = true; // 停顿 3 秒（在下一轮 tick 转为删除）
          return;
        }
        displayText = currentText.substring(0, displayText.length + 1);
        render();
      }
    }, 45);
    typeTimer = interval;
  }

  /* 切换到指定 Tab */
  function switchTab(tab) {
    var data = TAB_DATA[tab];
    if (!data) return;

    // 按钮高亮
    tabBtns.forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });

    // 标题（左滑淡入）
    titleEl.textContent = data.title;
    titleEl.classList.remove('tab-enter');
    void titleEl.offsetWidth; /* 强制重排以重启动画 */
    titleEl.classList.add('tab-enter');

    // 优势点（带入场动画：依次淡入）
    featuresEl.innerHTML = '';
    data.features.forEach(function (text, i) {
      var div = document.createElement('div');
      div.className = 'order-feature feature-anim';
      div.style.transitionDelay = (i * 0.08) + 's';
      div.innerHTML =
        '<img src="images/order/checkmark.png" alt="" />' +
        '<span></span>';
      div.querySelector('span').textContent = text;
      featuresEl.appendChild(div);
      requestAnimationFrame(function () { div.classList.add('show'); });
    });

    // AI 洞察面板（上浮淡入）
    var aiPanel = document.querySelector('.ai-panel');
    if (aiPanel) {
      aiPanel.classList.remove('tab-enter');
      void aiPanel.offsetWidth; /* 强制重排以重启动画 */
      aiPanel.classList.add('tab-enter');
    }

    // 重新启动打字机
    startTypewriter(data.insights);
  }

  tabBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      switchTab(btn.getAttribute('data-tab'));
    });
  });

  // 初始渲染
  switchTab('团餐');
})();

/* ---------- 4. 物流按钮激活切换 ---------- */
(function initLogisticsBtn() {
  var btn = document.getElementById('logisticsBtn');
  if (!btn) return;
  btn.addEventListener('click', function (e) {
    e.preventDefault();
    btn.classList.toggle('active');
  });
})();
