function UndoManager() {
    this.eventHistory = [];
    this.undoCount = 0;
}

// Constants
UndoManager.UNDO = 1;
UndoManager.REDO = 2;
// Need to:
//  - record events in the history
//  - be able to undo/redo
//    - map the event to it's undo/redo
UndoManager.prototype.record = function(event) {
    if (!event.replayType) {
        if (this.undoCount !== 0) {
            this.eventHistory.splice(0, this.eventHistory.length - this.undoCount);
            this.undoCount = 0;  // forget any available redos
        }
        this.eventHistory.push(event);
    } else if (event.replayType === UndoManager.UNDO) {
        this.undoCount++;
    } else if (event.replayType === UndoManager.REDO) {
        this.undoCount--;
        console.assert(this.undoCount >= 0, 'undo count is negative!');
    }
};

UndoManager.prototype.canUndo = function() {
    return this.eventHistory.length > this.undoCount;
};

UndoManager.prototype.canRedo = function() {
    return this.undoCount > 0;
};

UndoManager.prototype.undo = function() {
    var index = this.eventHistory.length - this.undoCount - 1,
        origEvent = this.eventHistory[index],
        event;

    if (index < 0) {
        return false;
    }

    console.log('undoing', origEvent);
    event = this.getInverseEvent(origEvent);
    event.replayType = UndoManager.UNDO;

    SnapCollaborator.applyEvent(event);
    return true;
};

UndoManager.prototype.redo = function() {
    var index = this.eventHistory.length - this.undoCount,
        origEvent = this.eventHistory[index],
        event;

    if (index >= this.eventHistory.length) {
        return false;
    }

    event = {
        type: origEvent.type,
        args: origEvent.args.slice()
    };
    event.replayType = UndoManager.REDO;

    SnapCollaborator.applyEvent(event);
    return true;
};

UndoManager.prototype.getInverseEvent = function(event) {
    var type = event.type,
        result;
    
    event = JSON.parse(JSON.stringify(event));  // deep copy
    result = UndoManager.Invert[type].call(this, event.args);

    if (result instanceof Array) {  // shorthand inverter result
        result = {
            type: type,
            args: result
        };
    } else if (typeof result === 'string') {
        result = {
            type: result,
            args: event.args
        }
    }

    return result;
};

UndoManager.Invert = {};
UndoManager.Invert.setStageSize = function(args) {
    // args are [width, height, oldHeight, oldWidth]
    return {
        type: 'setStageSize',
        args: args.reverse()
    };
};

    //serialized = SnapCollaborator.serializeBlock(block);

//UndoManager.Invert.addSprite = function(args) {
    //// args are [width, height, oldHeight, oldWidth]
    //return {
        //type: 'removeSprite',
        //args: args.reverse()
    //};
//};

    //// Sprites
    //'removeSprite',
    //'renameSprite',
UndoManager.Invert.toggleDraggable = function(args) {
    return [
        args[0],
        !args[1]
    ];
};
    //'duplicateSprite',
    //'importSprites',

    //// Sounds
    //'addSound',
    //'renameSound',
    //'removeSound',

    //// Costumes
    //'addCostume',
    //'renameCostume',
    //'removeCostume',
    //'updateCostume',

UndoManager.Invert.addVariable = function() {
    return 'deleteVariable';
};

UndoManager.Invert.deleteVariable = function() {
    return 'addVariable';
};

    //// Custom blocks
UndoManager.Invert.addCustomBlock = function(args) {
    var def = SnapCollaborator.serializer.loadCustomBlock(SnapCollaborator.serializer.parse(args[1]));
    return {
        type: 'deleteCustomBlock',
        args: [def.id, args[0]]
    };
};

UndoManager.Invert.deleteCustomBlock = function(args) {
    var serialized = args[2],
        ownerId = args[1];
    return {
        type: 'addCustomBlock',
        args: [ownerId, serialized, args[3]]
    };
};
    //'deleteCustomBlocks',

UndoManager.Invert.setCustomBlockType = function(args) {
    UndoManager.swap(args, 1, 3);  // category, oldCategory
    UndoManager.swap(args, 2, 4);  // type, oldType
    return args;
};
    //'updateBlockLabel',
    //'deleteBlockLabel',

    //// Block manipulation
UndoManager.Invert.addBlock = function(args) {
    // args are [block, ownerId, x, y, false, blockId]
    return {
        type: 'removeBlock',
        args: args.reverse()
    };
};

UndoManager.Invert.removeBlock = function(args) {
    // args are
    //  [id, userDestroy, y, x, ownerId, block]
    // or 
    //  [id, userDestroy, target]
    return {
        type: 'addBlock',
        args: args.reverse()
    };
};

UndoManager.Invert.setBlockPosition = function(args) {
    // args are [id, x, y, oldX, oldY] or [id, x, y, oldTarget]

    if (args.length === 5) {
        // Swap the old position and new position
        UndoManager.swap(args, 1, 3);  // x, oldX
        UndoManager.swap(args, 2, 4);  // y, oldY
        return {
            type: 'setBlockPosition',
            args: args
        };
    } else {  // previous was a moveBlock
        UndoManager.swap(args, 1, 3);  // x, oldTarget
        UndoManager.swap(args, 2, 3);  // y, x
        return {
            type: 'moveBlock',
            args: args
        };
    }
};

UndoManager.Invert.setBlocksPositions = function(args) {
    // args are [ids, positions, oldPositions]
    return {
        type: 'setBlocksPositions',
        args: [args[0], args[2], args[1]]
    };
};

UndoManager.swap = function(array, x, y) {
    var tmp = array.splice(y, 1)[0];
    array.splice(x, 0, tmp);
    return array;
};

UndoManager.Invert.moveBlock = function(args) {
    // args are either:
    //  [id, target, oldTarget]
    //    or
    //  [id, target, oldX, oldY]
    //    or
    //  [serializedBlock, target]
    var isFromMove = args.length === 3,
        isNewlyCreated = args.length === 4 && args[2] === false,
        isFromPosition = !isNewlyCreated && args.length === 4;

    // Check if had a position or old target
    if (isFromMove) {
        UndoManager.swap(args, 1, 2);
        return {
            type: 'moveBlock',
            args: args
        };
    } else if (isFromPosition) {  // x, y
        // move target to the end of the list
        var target = args.splice(1, 1)[0];
        args.push(target);
        return {
            type: 'setBlockPosition',
            args: args
        };
    } else if (isNewlyCreated) {  // newly created (dragged from palette)
        // Get the ids of the blocks
        // return removeBlock w/ [id, false, target, serializedBlock]
        // FIXME: May need to remove multiple blocks... may need another args
        return {
            type: 'removeBlock',
            args: args.reverse()
        };
    } else {
        logger.warn('Malformed moveBlock args!:', {type: 'moveBlock', args: args});
    }
};

    //'moveBlock',
    //'importBlocks',

UndoManager.Invert.addListInput = function() {
    return 'removeListInput';
};

UndoManager.Invert.removeListInput = function() {
    return 'addListInput';
};

UndoManager.Invert.ringify = function() {
    return 'unringify'
};

UndoManager.Invert.unringify = function() {
    return 'ringify'
};

UndoManager.Invert.addCostume = function(args) {
    var serialized = args[0],
        cos = SnapCollaborator.serializer.loadValue(SnapCollaborator.serializer.parse(serialized));

    return {
        type: 'removeCostume',
        args: [
            cos.id
        ]
    };
};

UndoManager.Invert.removeCostume = function(args) {
    args.shift();
    return {
        type: 'addCostume',
        args: args
    };
};

UndoManager.Invert.addSound = function(args) {
    var serialized = args[0],
        sound = SnapCollaborator.serializer.loadValue(SnapCollaborator.serializer.parse(serialized));
    return {
        type: 'removeSound',
        args: [
            sound.id
        ]
    };
};

UndoManager.Invert.removeSound = function(args) {
    args.shift();
    return {
        type: 'addSound',
        args: args
    };
};

UndoManager.Invert.updateCostume =
UndoManager.Invert.renameCostume =
UndoManager.Invert.renameSound =

UndoManager.Invert.setRotationStyle =
UndoManager.Invert.setSelector =
UndoManager.Invert.setBlockSpec =
UndoManager.Invert.setCommentText =
UndoManager.Invert.toggleBoolean =
UndoManager.Invert.setField = function(args) {
    return [
        args[0],  // name
        args[2]  // oldValue
    ];
};

var SnapUndo = new UndoManager();
