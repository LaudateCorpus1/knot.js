(function(window){
    var _isFilterEnabled = false;

    function parseHTMLInOpener (html){
        var div = window.opener.document.createElement('div');
        div.innerHTML = html;
        return div.childNodes[0];
    };

    var _elementPositionMask = $(parseHTMLInOpener('<div style="position: absolute; z-index: 99999999; border: 1px solid darkred">' +
        '<div style="width: 100%;height:100%; background-color: rgba(255,0,0,0.3);border:1px solid lightpink;"></div>' +
        '<div style="position: absolute; background-color: lightgoldenrodyellow;border: 1px solid lightgray;padding: 2px 5px;font-size: 0.9em"></div>' +
        '</div>'));

    var _mouseTip = $(parseHTMLInOpener('<div style="z-index: 99999999; position: absolute; background-color: lightgoldenrodyellow;border: 1px solid lightgray;padding: 2px 5px;font-size: 0.9em"></div>'));
    var _currentMaskTimeoutHandler = 0;
    window.debuggerModel ={
        logs:[],

        knotChangeLog:[],

        locateElement:function(){
            try{
                var closestVisibleEle = getClosestVisibleElement($(this.node));
                var pos = closestVisibleEle.offset();
                _elementPositionMask.css("left", pos.left).css("top",pos.top)
                    .width(Math.max(20, closestVisibleEle.outerWidth()))
                    .height(Math.max(20, closestVisibleEle.outerHeight()))
                    .find("div:nth-child(2)").css("top",_elementPositionMask.height()+3).text(this.description);

                $(window.opener.document.body).append(_elementPositionMask);
            }
            catch (err){
                alert(err.message);
            }

            clearTimeout(_currentMaskTimeoutHandler);
            _currentMaskTimeoutHandler = setTimeout(function(){
                _elementPositionMask.remove();
                _currentMaskTimeoutHandler = 0;
            }, 3*1000);
            _elementPositionMask[0].scrollIntoView();
        },

        checkDataContext: function(){
            var content = JSON.stringify(this.dataContext, null, 4);
            showJson("Current data context for \""+ this.description + "\"", content);
        },

        showKnotDetail:function(){
            function getDes(info){
                var msg  = "id:" +  info.id + " " +  (info.isFromLeftToRight?"output":"input") +"\n";
                msg += JSON.stringify(info.value);
                return msg;
            }
            var content = getDes(this.latestValueInfo);
            for(var i=this.historyValueInfo.length-1; i>=0 ; i--){
                content += "\n--------------------------------------\n";
                content += getDes(this.historyValueInfo[i]);
            }

            showJson("Value changed history for knot \"" + this.description + "\"" , content);
        },

        showKnotValueLogDetail:function(){
            var content = JSON.stringify(this.value, null, 4);
            showJson("Current data context for \""+ this.nodeDescription + " " + this.knotOption.description + "\"", content);
        }
    };


    var nodeDictionary = {
        _nodeArray:[],
        _nodeInfoArray:[],
        add:function(nodeInfo){
            this._nodeArray.push(nodeInfo.node); this._nodeInfoArray.push(nodeInfo);
        },
        remove:function(node){
            var index = this._nodeArray.indexOf(node);
            if(index >= 0){
                this._nodeArray.splice(index, 1);
                this._nodeInfoArray.splice(index, 1);
            }
        },
        get:function(node){
            return this._nodeInfoArray[this._nodeArray.indexOf(node)];
        }
    }

    function showJson(message, json){
        $("#jsonViewer").show()
            .find("textarea").val(json);
        $("#jsonViewer").find(".jsonViewerMessage").text(message);
    }

    function getClosestVisibleElement(element){
        if(element.offset().left == 0 && element.offset().top == 0){
            if(element[0].tagName.toLocaleLowerCase() == "body"){
                return element;
            }
            else{
                return getClosestVisibleElement(element.parent());
            }
        }
        else{
            return element;
        }
    }


    function getAPDescription(ap){
        if(ap.isComposite){
            return  "(" +
                ap.childrenAPs.map(function(t){return getAPDescription(t);}).join(" & ")
            ")>" + ap.nToOnePipe;
        }
        else{
            var pipes = ap.pipes?ap.pipes.join(" > "):"";
            if(pipes)
                return ap.description+" > " + pipes;
            else
                return ap.description;
        }
    }
    function getKnotOptionsStr(options){
        return getAPDescription(options.leftAP) + " : " + getAPDescription(options.rightAP);
    }

    function generateDOMTree(node){
        var nodeInfo = {
            isExpanded:true,
            childrenInfo: []
        }

        for(var i=0; i<node.children.length; i++){
            var info =generateDOMTree(node.children[i]);
            if(info){
                nodeInfo.childrenInfo.push(info);
                info.parent = nodeInfo;
            }
        }

        if(!node.__knot && nodeInfo.childrenInfo.length == 0)
            return null;

        if(node.__knot){
            nodeInfo.dataContext = node.__knot.dataContext;
            if(node.__knot.options){
                nodeInfo.options = [];
                for(var i=0; i< node.__knot.options.length; i++){
                    nodeInfo.options.push({
                        description:getKnotOptionsStr(node.__knot.options[i]),
                        knotOption:node.__knot.options[i],
                        latestValueInfo:null,
                        historyValueInfo:[]
                    });
                }
            }
        }
        else{
            nodeInfo.noKnotSetting = true;
        }

        nodeInfo.description = getHTMLElementDescription(node);
        nodeInfo.node = node;
        nodeDictionary.add(nodeInfo);
        return nodeInfo;
    }

    function getHTMLElementDescription(element){
        var description = element.tagName;
        if(element.id){
            description += "[#" + element.id+"]";
        }
        else if(element.className){
            description += "[" + element.className.split(" ")
                .filter(function(t){return t.trim()!="";})
                .map(function(t){return "."+t;})
                .join(" ")+ "]";
        }
        return description;
    }

    function searchInNode(node, keyword){
        node.isHighlighted = keyword? (node.description.toLowerCase().indexOf(keyword)>=0):false;
        if(node.options){
            for(var i=0; i< node.options.length; i++){
                node.options[i].isHighlighted = (node.options[i].description.toLowerCase().indexOf(keyword) >=0);
            }
        }
        for(var i=0;i<node.childrenInfo.length; i++){
            searchInNode(node.childrenInfo[i], keyword);
        }
    }
    function searchByNode(node, targetNode){
        var found = false;
        for(var i=0;i<node.childrenInfo.length; i++){
            if(searchByNode(node.childrenInfo[i], targetNode))
                found = true;
        }

        if(node.options){
            for(var i=0; i< node.options.length; i++){
                node.options[i].isHighlighted = false;
            }
        }
        if(!found)
            node.isHighlighted = (node.node == targetNode);
        return found || node.isHighlighted;
    }

    function collapseIrrelevantNodes(node){
        var collapse = true;
        for(var i=0;i<node.childrenInfo.length; i++){
            if(collapseIrrelevantNodes(node.childrenInfo[i]))
                collapse = false;
        }

        var highlighted = node.isHighlighted;
        if(!highlighted && node.options){
            for(var i=0; i<node.options.length;i++){
                if(node.options[i].isHighlighted)
                {
                    highlighted = true;
                    break;
                }
            }
        }
        node.isExpanded = highlighted || !collapse;
        return node.isExpanded;
    }
    function expandAll(node){
        for(var i=0;i<node.childrenInfo.length; i++){
            expandAll(node.childrenInfo[i]);
        }
        node.isExpanded = true;
    }


    window.Knot.ready(function(succ, err){
        if(!succ){
            alert(err.message);
            return;
        }

        if(!window.opener){
            alert("This page should only be opened by Knot debugger.")
            return;
        }

        var arr = window.opener.knotjsDebugger.getCachedLogs();
        for(var i= arr.length-1; i>=0; i--)
            window.debuggerModel.logs.push(arr[i]);

        $("#ownerWindowInfo").text((window.opener.document.title?window.opener.document.title:"untitled") + " ["+ window.opener.location+"]");

        $("#locateElementButton").click(function(){
            $("#fullWindowMessage").show().find("div").text("Use mouse left button to pick an element from the original page.");
            var downHandler = function(arg){
                var e = window.opener.document.elementFromPoint(arg.clientX, arg.clientY);
                searchByNode(window.debuggerModel.domTreeNodes[0], e);
                window.opener.removeEventListener("mousedown", downHandler, true);
                window.opener.removeEventListener("mousemove", mouseMoveHandler);
                arg.preventDefault();
                $("#fullWindowMessage").hide();
                _mouseTip.remove();

                if(_isFilterEnabled)
                    collapseIrrelevantNodes(window.debuggerModel.domTreeNodes[0]);
            };
            window.opener.addEventListener("mousedown",downHandler , true);

            $(window.opener.document.body).append(_mouseTip);
            var mouseMoveHandler = function(arg){
                var e = window.opener.document.elementFromPoint(arg.clientX, arg.clientY);
                if(e){
                    _mouseTip.text(getHTMLElementDescription(e));
                }
                _mouseTip.css("top",window.opener.document.body.scrollTop +  arg.clientY+25).css("left", window.opener.document.body.scrollLeft +arg.clientX);
            };
            window.opener.addEventListener("mousemove",mouseMoveHandler);
        });

        $("#searchButton").click(function(){
            searchInNode(window.debuggerModel.domTreeNodes[0], $("#searchText").val().toLowerCase().trim());
            if(_isFilterEnabled)
                collapseIrrelevantNodes(window.debuggerModel.domTreeNodes[0]);
        });
        $("#searchText").keyup(function(e){
            if(e.which == 13){
                searchInNode(window.debuggerModel.domTreeNodes[0], $("#searchText").val().toLowerCase().trim());
                if(_isFilterEnabled)
                    collapseIrrelevantNodes(window.debuggerModel.domTreeNodes[0]);
            }
        });

        $("#closeJsonViewer").click(function(){
            $("#jsonViewer").hide();
        });

        $("#enableFilterButton").click(function(){
            _isFilterEnabled = !_isFilterEnabled;
            if(_isFilterEnabled){
                $("#enableFilterButton").addClass("iconButtonChecked");
            }
            else{
                $("#enableFilterButton").removeClass("iconButtonChecked");
            }

            if(_isFilterEnabled)
                collapseIrrelevantNodes(window.debuggerModel.domTreeNodes[0]);
            else
                expandAll(window.debuggerModel.domTreeNodes[0]);
        });

        window.debuggerModel.domTreeNodes = [generateDOMTree(window.opener.document.body)];
    })


    function startsWith(s, startStr){
        return s.substr(0, startStr.length) == startStr;
    };

    var SetWithColorAnmation = {
        doesSupport:function(target, apName){
            if(target instanceof HTMLElement && startsWith(apName, "colorSet_"))
                return true;
            return false;
        },
        getValue: function(target, apName){
        },
        setValue: function(target, apDescription, value){
            apDescription = apDescription.substr("colorSet_".length);
            var apName = apDescription.split(",")[0].trim();
            var colorFrom = apDescription.split(",")[1].trim();
            var colorTo = apDescription.split(",")[2].trim();
            target[apName] = value;
            $(target).stop()
                .css("backgroundColor", colorFrom)
                .animate({backgroundColor:colorTo}, 3000);
        },
        doesSupportMonitoring: function(target, apName){
            return false;
        }
    };
    window.Knot.Advanced.registerAPProvider(SetWithColorAnmation);

    var _debugLogCount = 0;
    window.calledByOpener = {
        log:function(log){
            window.debuggerModel.logs.unshift(log);
        },
        debugger:{
            helper:{
                setIsTiedUp:function(leftTarget,  knotOption, isTiedUp){
                    var info = nodeDictionary.get(leftTarget);
                    if(!info)
                        return;

                    for(var i=0; i<info.options.length; i++){
                        if(info.options[i].knotOption == knotOption){
                            this.options[i].isTiedUp = isTiedUp;
                            return;
                        }
                    }
                }
            },

            knotChanged:function(leftTarget, rightTarget, knotOption, latestValue, isFromLeftToRight){
                var info = nodeDictionary.get(leftTarget);
                if(!info)
                    return;
                for(var i=0; i<info.options.length; i++){
                    if(info.options[i].knotOption == knotOption){
                        if(info.options[i].latestValueInfo)
                            info.options[i].historyValueInfo.push(info.options[i].latestValueInfo);
                        info.options[i].latestValueInfo = {id:_debugLogCount++, value:latestValue,isFromLeftToRight:isFromLeftToRight};
                        window.debuggerModel.knotChangeLog.unshift({
                            id:info.options[i].latestValueInfo.id,
                            nodeDescription: info.description,
                            knotOption: info.options[i],
                            value:latestValue,
                            isFromLeftToRight:isFromLeftToRight
                        });
                        return;
                    }
                }
            },

            knotTied: function(leftTarget, rightTarget, knotOption){
                //this.helper.setIsTiedUp(leftTarget, knotOption, true);
            },
            knotUntied:function(leftTarget, rightTarget, knotOption){
                //this.helper.setIsTiedUp(leftTarget, knotOption, false);
            },

            nodeAdded: function(node){
                var n = node;
                while(n && !nodeDictionary.get(n.parentNode)){
                    n = n.parentNode;
                }
                if(n){
                    var info = generateDOMTree(n);
                    var parentInfo = nodeDictionary.get(n.parentNode);
                    var index =  Array.prototype.indexOf.call(n.parentNode.childNodes, n);
                    parentInfo.childrenInfo.splice(index, 0, info);
                    info.parent = parentInfo;
                }
            },
            nodeRemoved: function(node){
                var info = nodeDictionary.get(node);
                if(!info)
                    return;
                if(info.parent){
                    info.parent.childrenInfo.splice(info.parent.childrenInfo.indexOf(info), 1);
                    info.parent = null;
                }
                nodeDictionary.remove(info.node);
            }
        }
    }
})((function() {
        return this;
    })());