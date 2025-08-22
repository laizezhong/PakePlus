// 群聊消息分析插件
(function() {
    'use strict';
    
    // 插件配置
    const PLUGIN_CONFIG = {
        // API配置
        api: {
            baseUrl: 'https://techagent.yeepay.com',  // API基础地址
            endpoint: '/chatbot/get_answer',           // API端点
            clickUsageEndpoint: '/chatbot/click_answer',  // 点击使用量收集API端点
            token: 'Bearer app-bb0PO2n760j0Fxgj3mqCNFVm'  // 认证令牌
        },
        
        // URL匹配规则（可在这里配置需要激活插件的页面）
        urlPatterns: [
            /qiyukf\.com\/chat\/\?id=\d+/i,         // 七鱼客服系统
        ],
        
        // 消息选择器配置
        messageSelectors: {
            messageItem: '.msg',                    // 消息容器
            messageContent: 'span[data-test="content"]',  // 消息内容
            senderName: 'span[data-test="name"]',   // 发送人名称  
            messageTime: 'span[data-test="time"]',  // 消息时间
            groupName: '.nick',                      // 群聊/用户名称
            popTrigger: '.msg-bubble'                 // 悬浮触发区域 msg-main、msg-bubble
        },
        
        debug: true // 是否打印调试日志，直接写死为true
    };
    
    // 日志输出工具函数
    function pluginLog(...args) {
        if (PLUGIN_CONFIG.debug) {
            console.log('[群聊插件]', ...args);
        }
    }
    function pluginError(...args) {
        if (PLUGIN_CONFIG.debug) {
            console.error('[群聊插件]', ...args);
        }
    }
    function pluginWarn(...args) {
        if (PLUGIN_CONFIG.debug) {
            console.warn('[群聊插件]', ...args);
        }
    }
    
    // 检查当前页面是否需要激活插件
    function shouldActivatePlugin() {
        const currentUrl = window.location.href;
        return PLUGIN_CONFIG.urlPatterns.some(pattern => pattern.test(currentUrl));
    }
    
    // 初始化插件
    function initPlugin() {
        if (!shouldActivatePlugin()) {
            pluginLog('当前页面不匹配，插件未激活');
            return;
        }
        
        pluginLog('插件已激活在页面:', window.location.href);
        
        // 监听消息悬停事件
        setupMessageHoverListener();
    }
    
    // 全局变量保存消息点击监听器
    let onMessageClickHandler = null;

    // 设置消息悬停监听器
    function setupMessageHoverListener() {
        if (onMessageClickHandler) return; // 防止重复绑定
        
        /**
         * 鼠标悬停进入处理
         * 只在鼠标进入.msg-bubble最外层时触发，避免因子元素冒泡导致的按钮闪现
         */
        const handleMouseEnter = function(event) {
            // 修复：只有Element类型才可用closest
            if (!(event.target instanceof Element)) return;
            // 只处理鼠标进入.msg-bubble最外层的情况
            const popTrigger = event.target.closest(PLUGIN_CONFIG.messageSelectors.popTrigger);
            if (!popTrigger || event.target !== popTrigger) return;
            // 找到对应的消息容器元素
            let messageElement = popTrigger.closest(PLUGIN_CONFIG.messageSelectors.messageItem);
            if (!messageElement) return;
            // 排除系统消息、分割线、历史提示等类型消息
            if (
                messageElement.classList.contains('msg-sys') ||
                messageElement.classList.contains('msg-splitLine') ||
                messageElement.classList.contains('m-msgsplit') ||
                messageElement.classList.contains('msg-cnotify') ||
                messageElement.classList.contains('msg-ainvalid') ||
                messageElement.classList.contains('msg-right') // 新增：排除右侧消息
            ) {
                return;
            }
            // 不再检查当前消息是否已有悬浮窗，因为我们会在创建前移除所有悬浮窗
            // 检查消息内容是否为空
            let hasContent = false;
            // 1. 检查主要内容选择器
            const contentElement = messageElement.querySelector(PLUGIN_CONFIG.messageSelectors.messageContent);
            if (contentElement && contentElement.textContent.trim()) {
                hasContent = true;
            }
            // 1.5 检查图片内容
            if (!hasContent) {
                const imageElement = messageElement.querySelector('img.m-message-image_pic');
                if (imageElement && imageElement.src) {
                    hasContent = true;
                }
            }
            // 2. 检查气泡内文本
            if (!hasContent) {
                const popTrigger = messageElement.querySelector(PLUGIN_CONFIG.messageSelectors.popTrigger);
                if (popTrigger) {
                    const timeElement = popTrigger.querySelector('.time');
                    let bubbleText = popTrigger.textContent.trim();
                    if (timeElement) {
                        bubbleText = bubbleText.replace(timeElement.textContent.trim(), '').trim();
                    }
                    if (bubbleText) {
                        hasContent = true;
                    }
                }
            }
            // 3. 检查富文本内容
            if (!hasContent) {
                const richContent = messageElement.querySelector('.m-cnt');
                if (richContent && richContent.textContent.trim()) {
                    hasContent = true;
                }
            }
            // 4. 检查系统消息内容（但系统消息不显示AI按钮）
            if (!hasContent) {
                if (messageElement.classList.contains('msg-sys')) {
                    const bubbleText = messageElement.querySelector('.msg-bubble');
                    if (bubbleText && bubbleText.textContent.trim()) {
                        hasContent = true;
                    }
                }
            }
            if (!hasContent) return;
            // 创建悬浮内容
            createFloatingContent(messageElement);
        };
        
        /**
         * 鼠标悬停离开处理
         * 只在鼠标离开.msg-bubble最外层时触发，避免因子元素冒泡导致的按钮误移除
         */
        const handleMouseLeave = function(event) {
            // 修复：只有Element类型才可用closest
            if (!(event.target instanceof Element)) return;
            // 只处理鼠标离开.msg-bubble最外层的情况
            const msgBubble = event.target.closest('.msg-bubble');
            if (!msgBubble || event.target !== msgBubble) return;
            // 找到对应的消息容器元素
            let messageElement = msgBubble.closest(PLUGIN_CONFIG.messageSelectors.messageItem);
            if (!messageElement) return;
            // 判断鼠标是否还在当前msg-bubble内（如在悬浮内容上等），还在则不移除
            if (msgBubble && event.relatedTarget && msgBubble.contains(event.relatedTarget)) {
                return;
            }
            // 延迟移除悬浮内容，避免鼠标移动到悬浮内容上时立即消失
            setTimeout(() => {
                const floatingContent = messageElement.querySelector('.ai-floating-content');
                if (floatingContent && !floatingContent.matches(':hover')) {
                    floatingContent.remove();
                }
            }, 200);
        };
        
        // 添加事件监听 - 使用事件委托，监听整个文档
        document.addEventListener('mouseenter', handleMouseEnter, true);
        document.addEventListener('mouseleave', handleMouseLeave, true);
        
        // 额外监听消息容器的鼠标事件，确保整个消息区域都能触发
        const chatContainer = document.querySelector('#chat-view');
        if (chatContainer) {
            chatContainer.addEventListener('mouseenter', handleMouseEnter, true);
            chatContainer.addEventListener('mouseleave', handleMouseLeave, true);
        }
        
        // 保存处理器引用以便后续移除
        onMessageClickHandler = { handleMouseEnter, handleMouseLeave };
        
        pluginLog('已添加消息悬停监听（仅右侧消息）');
    }

    /**
     * 移除页面上所有的悬浮窗
     */
    function removeAllFloatingContents() {
        const allFloatingContents = document.querySelectorAll('.ai-floating-content');
        allFloatingContents.forEach(content => {
            content.remove();
        });
        if (allFloatingContents.length > 0) {
            pluginLog(`已移除 ${allFloatingContents.length} 个悬浮窗`);
        }
    }
    
    /**
     * 创建悬浮内容，并插入到消息框上方
     * @param {Element} messageElement 消息容器元素
     */
    function createFloatingContent(messageElement) {
        // 先移除所有现有悬浮窗
        removeAllFloatingContents();
        const floatingContent = document.createElement('div');
        floatingContent.className = 'ai-floating-content';
        
        // 定位逻辑：放在发送者区域顶部，向上扩展
        let positionStyle = '';
        
                 // 根据消息方向调整左右对齐，并偏移以避免遮挡上一条消息
         if (messageElement.classList.contains('msg-left')) {
             // 用户消息，向右偏移
             positionStyle = `
                 position: absolute;
                 bottom: 100%; /* 固定在容器底部，向上扩展 */
                 margin-bottom: 2px; /* 与顶部保持一点距离 */
                 left: 50px; /* 向右偏移，避免遮挡上一条消息 */
                 right: auto;
             `;
         } else {
             // 客服消息，向左偏移
             positionStyle = `
                 position: absolute;
                 bottom: 100%; /* 固定在容器底部，向上扩展 */
                 margin-bottom: 2px; /* 与顶部保持一点距离 */
                 right: 50px; /* 向左偏移，避免遮挡上一条消息 */
                 left: auto;
             `;
         }
        
        // 调试输出
        if (PLUGIN_CONFIG.debug) {
            pluginLog('设置悬浮窗在发送者区域顶部，向上扩展');
        }
        
        floatingContent.style.cssText = `
            ${positionStyle}
            background: #ffffff;
            border: 1px solid #e8e8e8;
            border-radius: 6px;
            padding: 8px 12px;
            font-size: 12px;
            cursor: pointer;
            z-index: 1000;
            max-width: 280px; /* 减小最大宽度，避免遮挡 */
            min-width: 120px;
            max-height: 150px;
            overflow-y: auto;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            transition: all 0.2s ease;
            word-wrap: break-word;
            line-height: 1.4;
            text-align: left;
        `;
        
        // 初始显示加载状态
        floatingContent.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 12px; height: 12px; border: 2px solid #f3f3f3; border-top: 2px solid #1890ff; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                <span style="color: #666;">正在查询...</span>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;
        
        // 鼠标悬停效果
        floatingContent.addEventListener('mouseenter', () => {
            floatingContent.style.transform = 'scale(1.02)';
            floatingContent.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)';
        });
        floatingContent.addEventListener('mouseleave', () => {
            floatingContent.style.transform = 'scale(1)';
            floatingContent.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        });
        
        // 点击事件：点击后粘贴到输入框
        floatingContent.addEventListener('click', (e) => {
            e.stopPropagation();
            // 优先使用保存的完整内容
            const fullContent = floatingContent.getAttribute('data-full-content');
            const content = fullContent || floatingContent.textContent.trim();
            
            if (content && content !== '正在查询...') {
                // 检查是否以【XX】开头
                const bracketMatch = content.match(/^【[^】]*】/);
                if (bracketMatch) {
                    // 获取消息信息用于API调用
                    const messageInfo = extractMessageInfo(messageElement);
                    pasteToInputBox(content, messageInfo, floatingContent);
                    pluginLog('内容以标签开头，执行粘贴操作');
                } else {
                    pluginLog('内容不以标签开头，不执行粘贴操作');
                }
            }
        });
        
        // 尝试找到发送者区域作为容器
        let senderContainer = null;
        
        // 1. 首先尝试找到发送者姓名元素的父容器
        const senderName = messageElement.querySelector(PLUGIN_CONFIG.messageSelectors.senderName);
        if (senderName) {
            senderContainer = senderName.parentElement;
            pluginLog('找到发送者姓名元素');
        }
        
        // 2. 如果找不到发送者姓名，尝试找消息头部区域
        if (!senderContainer) {
            senderContainer = messageElement.querySelector('.msg-header') || 
                             messageElement.querySelector('.msg-title');
            if (senderContainer) {
                pluginLog('找到消息头部区域');
            }
        }
        
        // 3. 如果上述都找不到，回退到消息主体
        if (!senderContainer) {
            senderContainer = messageElement.querySelector('.msg-main');
            if (senderContainer) {
                pluginLog('回退到消息主体');
            }
        }
        
        if (senderContainer) {
            // 确保容器有position:relative
            senderContainer.style.position = 'relative';
            
            // 悬浮内容添加到发送者容器
            senderContainer.appendChild(floatingContent);
            
            // 确保悬浮窗可见
            floatingContent.style.zIndex = '1000';
            pluginLog('已添加悬浮窗到发送者区域');
        } else {
            pluginError('未找到合适的容器元素');
        }
        
        // 提取消息信息并调用API
        const messageInfo = extractMessageInfo(messageElement);
        if (messageInfo) {
            queryAPIAndUpdateContent(messageInfo, floatingContent);
        }
    }
    
    // 调用API查询并更新悬浮内容
    async function queryAPIAndUpdateContent(messageInfo, floatingContent) {
        try {
            const apiUrl = `${PLUGIN_CONFIG.api.baseUrl}${PLUGIN_CONFIG.api.endpoint}`;
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': PLUGIN_CONFIG.api.token,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    group_name: messageInfo.groupName,
                    user_name: messageInfo.senderName,
                    question: messageInfo.content,
                    message_type: messageInfo.messageType,
                    create_time: messageInfo.timestamp,
                })
            });
            
            if (!response.ok) {
                pluginError(`HTTP error! status: ${response.status}`);
                floatingContent.innerHTML = `
                    <div style="color: #ff4d4f; font-size: 12px;">
                        系统异常，请稍后重试
                    </div>
                `;
            }
            
            const data = await response.json();
            let fullResult = '【高】' + (data.answer1 || '未能获取查询结果，请稍后重试');

            // 将接口的\n替换为<br>
            fullResult = fullResult.replace(/\n/g, '<br>');
            
            // 保存完整内容到悬浮元素的data属性中
            floatingContent.setAttribute('data-full-content', fullResult);
            
            // 暂存API返回的关键参数，用于后续的点击使用量收集
            floatingContent.setAttribute('data-api-id', data.id || '');
            floatingContent.setAttribute('data-qiyu-channel', data.qiyu_channel || '');
            floatingContent.setAttribute('data-qiyu-industry', data.qiyu_industry || '');

            // 显示内容（截断版本）
            let displayResult = fullResult;
            if (displayResult.length > 100) {
                displayResult = displayResult.substring(0, 100) + '...';
            }
            
            // 更新悬浮内容
            floatingContent.innerHTML = `
                <div style="color: #333; font-size: 12px; line-height: 1.4; text-align: left;">
                    ${displayResult}
                </div>
            `;
            
            // 根据内容长度动态调整宽度，但限制最大宽度，避免遮挡
            const textLength = displayResult.length;
            if (textLength > 100) {
                floatingContent.style.maxWidth = '280px';
            } else if (textLength > 30) {
                floatingContent.style.maxWidth = '300px';
            } else {
                floatingContent.style.maxWidth = '350px';
            }
            
            pluginLog('API查询完成，结果已更新到悬浮内容');
            
        } catch (error) {
            pluginError('API查询失败:', error);
            
            // 检查是否是混合内容错误
            if (error.message.includes('Mixed Content') || error.message.includes('Failed to fetch')) {
                floatingContent.innerHTML = `
                    <div style="color: #ff4d4f; font-size: 12px;">
                        网络连接异常，请检查服务器配置
                    </div>
                `;
            } else {
                floatingContent.innerHTML = `
                    <div style="color: #ff4d4f; font-size: 12px;">
                        系统异常，请稍后重试
                    </div>
                `;
            }
        }
    }
    
    // 粘贴内容到输入框
    function pasteToInputBox(content, messageInfo = null, floatingContent = null) {
        try {
            // 查找富文本输入框
            const editor = document.querySelector('.ql-editor[contenteditable="true"]');
            if (editor) {
                // 去掉开头的【XX】格式内容
                let processedContent = content;
                const bracketMatch = content.match(/^【[^】]*】/);
                if (bracketMatch) {
                    processedContent = content.substring(bracketMatch[0].length).trim();
                    pluginLog('已去掉开头标签:', bracketMatch[0], '处理后的内容:', processedContent);
                }
                
                // 将<br>标签转换为换行符，以便在富文本编辑器中正确显示
                processedContent = processedContent.replace(/<br>/gi, '\n');
                
                editor.innerHTML = processedContent;
                // 触发输入事件，确保富文本框能感知内容变化
                editor.dispatchEvent(new Event('input', { bubbles: true }));
                pluginLog('已粘贴到输入框:', processedContent);

                // 执行完粘贴操作后，调用API收集点击使用量
                if (messageInfo && floatingContent) {
                    const { groupName, senderName, content: question } = messageInfo;
                    
                    // 从floatingContent中获取暂存的API参数
                    const apiId = floatingContent.getAttribute('data-api-id') || '';
                    const qiyuChannel = floatingContent.getAttribute('data-qiyu-channel') || '';
                    const qiyuIndustry = floatingContent.getAttribute('data-qiyu-industry') || '';
                    
                    collectClickUsage(groupName, senderName, question, content, apiId, qiyuChannel, qiyuIndustry);
                    pluginLog('已调用API收集点击使用量');
                }
            } else {
                pluginError('未找到富文本输入框');
            }
        } catch (error) {
            pluginError('粘贴到输入框时出错:', error);
        }
    }
    
    // 新增：格式化时间戳，补全年份
    function formatTimestamp(timeStr) {
        if (!timeStr) return null;

        const now = new Date();
        
        // 新增：匹配 "今天 HH:mm" 或 "今天 HH:mm:ss"
        const todayMatch = timeStr.match(/^今天\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (todayMatch) {
            const date = new Date(now);
            const hours = parseInt(todayMatch[1], 10);
            const minutes = parseInt(todayMatch[2], 10);
            const seconds = todayMatch[3] ? parseInt(todayMatch[3], 10) : 0;
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }

        // 匹配 "昨天 HH:mm" 或 "昨天 HH:mm:ss"
        const yesterdayMatch = timeStr.match(/^昨天\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (yesterdayMatch) {
            const date = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            const hours = parseInt(yesterdayMatch[1], 10);
            const minutes = parseInt(yesterdayMatch[2], 10);
            const seconds = yesterdayMatch[3] ? parseInt(yesterdayMatch[3], 10) : 0;
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
        
        // 匹配 "MM-DD HH:mm" 或 "MM-DD HH:mm:ss"
        const monthDayMatch = timeStr.match(/^(\d{2})-(\d{2})\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (monthDayMatch) {
            let year = now.getFullYear();
            const month = parseInt(monthDayMatch[1], 10) - 1;
            const day = parseInt(monthDayMatch[2], 10);

            // 如果日期在未来，则为去年
            const tempDate = new Date(year, month, day, 23, 59, 59);
            if (tempDate > now) {
                year--;
            }
            const hours = parseInt(monthDayMatch[3], 10);
            const minutes = parseInt(monthDayMatch[4], 10);
            const seconds = monthDayMatch[5] ? parseInt(monthDayMatch[5], 10) : 0;
            return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
        
        // 匹配 "HH:mm" 或 "HH:mm:ss" (今天)
        const timeOnlyMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (timeOnlyMatch) {
            const date = new Date(now);
            const hours = parseInt(timeOnlyMatch[1], 10);
            const minutes = parseInt(timeOnlyMatch[2], 10);
            const seconds = timeOnlyMatch[3] ? parseInt(timeOnlyMatch[3], 10) : 0;
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }

        // 如果已经是 "YYYY-MM-DD HH:mm:ss" 格式，直接返回
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timeStr)) {
            return timeStr;
        }

        // 无法识别，返回原始值
        pluginWarn('无法解析时间格式:', timeStr);
        return timeStr;
    }
    
    // 提取消息信息
    function extractMessageInfo(messageElement) {
        try {
            // 获取群聊名称（在页面顶部的聊天信息中）
            const groupNameElement = document.querySelector(PLUGIN_CONFIG.messageSelectors.groupName);
            const groupName = groupNameElement ? 
                groupNameElement.textContent.trim() : 
                '未知群聊';
            
            // 获取发送人信息（优先从消息元素内部查找）
            let senderName = '未知用户';
            const senderElement = messageElement.querySelector(PLUGIN_CONFIG.messageSelectors.senderName);
            if (senderElement) {
                senderName = senderElement.textContent.trim();
            } else {
                // 如果是系统消息或右侧消息，可能没有发送人名称
                if (messageElement.classList.contains('msg-sys')) {
                    senderName = '系统';
                } else if (messageElement.classList.contains('msg-right')) {
                    senderName = '客服';
                } else if (messageElement.classList.contains('msg-left')) {
                    senderName = '用户';
                }
            }

            // 判断消息类型（图片 or 文字）
            let messageContent = '';
            let messageType = 'text';
            // 检查是否为图片消息
            const imageElement = messageElement.querySelector('img.m-message-image_pic');
            if (imageElement && imageElement.src) {
                messageContent = imageElement.src;
                messageType = 'image';
            } else {
                // 文字消息逻辑
                const contentElement = messageElement.querySelector(PLUGIN_CONFIG.messageSelectors.messageContent);
                if (contentElement) {
                    messageContent = contentElement.textContent.trim();
                } else {
                    // 如果没有找到指定的内容元素，尝试其他方式
                    const msgBubble = messageElement.querySelector('.msg-bubble');
                    if (msgBubble) {
                        // 移除时间元素后获取内容
                        const timeElement = msgBubble.querySelector('.time');
                        let bubbleText = msgBubble.textContent.trim();
                        if (timeElement) {
                            bubbleText = bubbleText.replace(timeElement.textContent.trim(), '').trim();
                        }
                        messageContent = bubbleText;
                    }
                }
            }

            // 获取消息时间
            let rawTimestamp = null;
            const timeElement = messageElement.querySelector(PLUGIN_CONFIG.messageSelectors.messageTime);
            if (timeElement) {
                rawTimestamp = timeElement.textContent.trim();
            }
            const timestamp = formatTimestamp(rawTimestamp);
            
            // 获取消息方向
            const direction = messageElement.classList.contains('msg-sys') ? 'system' :
                              messageElement.classList.contains('msg-right') ? 'sent' : 'received';
            
            return {
                content: messageContent,
                senderName,
                groupName,
                timestamp,
                direction, // 原messageType改为direction
                messageType, // 原messageContentType改为messageType
                url: window.location.href
            };
        } catch (error) {
            pluginError('提取消息信息时出错:', error);
            return null;
        }
    }
    
    // === 激活/失活机制集成 ===
    let pluginActive = false;
    let urlCheckTimer = null;

    function activatePluginIfNeeded() {
        if (shouldActivatePlugin()) {
            if (!pluginActive) {
                initPlugin();
                pluginActive = true;
                pluginLog('已激活');
            }
        } else {
            if (pluginActive) {
                destroyPlugin();
                pluginActive = false;
                pluginLog('已失活');
            }
        }
    }

    // 失活时移除所有事件监听、定时器等
    function destroyPlugin() {
        // 1. 移除消息悬停监听
        if (onMessageClickHandler) {
            document.removeEventListener('mouseenter', onMessageClickHandler.handleMouseEnter, true);
            document.removeEventListener('mouseleave', onMessageClickHandler.handleMouseLeave, true);
            
            // 移除聊天容器的监听器
            const chatContainer = document.querySelector('#chat-view');
            if (chatContainer) {
                chatContainer.removeEventListener('mouseenter', onMessageClickHandler.handleMouseEnter, true);
                chatContainer.removeEventListener('mouseleave', onMessageClickHandler.handleMouseLeave, true);
            }
            
            onMessageClickHandler = null;
            pluginLog('已移除消息悬停监听');
        }
        
        // 2. 清理所有悬浮内容
        const floatingContents = document.querySelectorAll('.ai-floating-content');
        floatingContents.forEach(content => content.remove());
        
        // 注意：不清理URL定时器，保持URL监听器持续运行
        // 3. 重置激活状态
        pluginActive = false;
    }

    // 监听URL变化
    let lastUrl = location.href;
    // 只在没有定时器时才创建新的定时器
    if (!urlCheckTimer) {
        urlCheckTimer = setInterval(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                activatePluginIfNeeded();
            }
        }, 500);
        pluginLog('已创建URL监听器');
    }

    // API调用函数：收集点击使用量
    async function collectClickUsage(groupName, userName, question, answer, apiId, qiyuChannel, qiyuIndustry) {
        try {
            const apiUrl = PLUGIN_CONFIG.api.baseUrl + PLUGIN_CONFIG.api.clickUsageEndpoint;
            const requestData = {
                group_name: groupName || '', // 群名
                user_name: userName || '', // 发送者
                question: question || '', // 问题
                answer: answer || '', // 答案
                id: apiId || '', // API返回的id
                qiyu_channel: qiyuChannel || '', // 七鱼渠道
                qiyu_industry: qiyuIndustry || '' // 七鱼行业
            };
            pluginLog('点击使用量收集，请求参数:', requestData);

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': PLUGIN_CONFIG.api.token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });
            pluginLog('点击使用量收集，响应:', response);

            if (response.ok) {
                const result = await response.json();
                pluginLog('点击使用量收集成功:', result);
            } else {
                pluginError('点击使用量收集失败:', response.status, response.statusText);
            }
        } catch (error) {
            pluginError('API调用出错:', error);
        }
    }

    // 页面初始也要判断一次
    activatePluginIfNeeded();
    
})(); 