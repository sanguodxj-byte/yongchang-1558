-- SPDX-License-Identifier: AGPL-3.0-only
-- Both Dora and H5 run the same Godot game/content package.
local D = require("Dora")
D.Director.clearColor = D.Color(0xff191919)
local reason = D.GodotNode.getUnsupportedReason()
assert(reason == "", reason)
local project = D.Content:exist("game.pck") and "game.pck" or "game"
local game = assert(D.GodotNode(project, "", 1600, 1000, 3), "Cannot create Yongchang Godot runtime")
local requestedWidth, requestedHeight = 1600, 1000
game:addTo(D.Director.ui)
local ready = false
game:schedule(function()
    local size = D.View.size
    local compact = size.width < 1000 or size.height < 600
    local width, height = compact and math.floor(size.width) or 1600, compact and math.floor(size.height) or 1000
    if game.running and (width ~= requestedWidth or height ~= requestedHeight) then
        if game:resizeViewport(width, height) then requestedWidth, requestedHeight = width, height end
    end
    local actual = game.viewportSize
    local scale = math.min(size.width / actual.width, size.height / actual.height)
    game.scaleX, game.scaleY = scale, scale
    assert(game.lastError == "", game.lastError)
    if game.running and not ready then
        ready = true
        print("Yongchang common runtime ready")
    end
    return false
end)
