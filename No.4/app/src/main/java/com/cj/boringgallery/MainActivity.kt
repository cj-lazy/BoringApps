package com.cj.boringgallery

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.ContentUris
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.staggeredgrid.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import coil.ImageLoader
import coil.compose.AsyncImage
import coil.decode.VideoFrameDecoder
import coil.request.ImageRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MaterialTheme { BoringGalleryApp() } }
    }
}

// ================= 数据模型与高精度拖拽引擎 =================
data class CustomAlbum(val id: String, val name: String, val mediaUris: Set<String>)

@Stable
class DragDropController {
    var isDragging by mutableStateOf(false)
    var dragItemUri by mutableStateOf<String?>(null)
    var dragOffset by mutableStateOf(Offset.Zero)
    var dragItemPositionInRoot by mutableStateOf(Offset.Zero)
    var hoveredAlbumId by mutableStateOf<String?>(null)
    var initialPhotoBounds by mutableStateOf(Rect.Zero)

    val dropTargets = mutableStateMapOf<String, Rect>()

    fun startDrag(uri: String, bounds: Rect) {
        isDragging = true
        dragItemUri = uri
        dragOffset = Offset.Zero
        initialPhotoBounds = bounds
        dragItemPositionInRoot = Offset(bounds.left, bounds.top)
        hoveredAlbumId = null
    }

    fun updateDrag(dragAmount: Offset) {
        dragOffset += dragAmount
        dragItemPositionInRoot = Offset(initialPhotoBounds.left + dragOffset.x, initialPhotoBounds.top + dragOffset.y)

        val centerX = dragItemPositionInRoot.x + initialPhotoBounds.width / 2f
        val centerY = dragItemPositionInRoot.y + initialPhotoBounds.height / 2f
        val centerOffset = Offset(centerX, centerY)

        hoveredAlbumId = dropTargets.entries.firstOrNull { it.value.contains(centerOffset) }?.key
    }

    fun endDrag(): String? {
        val targetId = hoveredAlbumId
        isDragging = false
        dragItemUri = null
        dragOffset = Offset.Zero
        dragItemPositionInRoot = Offset.Zero
        hoveredAlbumId = null
        return targetId
    }
}

data class MediaItem(val uri: String, val date: String, val hasLocation: Boolean, val isVideo: Boolean, val timestamp: Long)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BoringGalleryApp() {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var hasPermission by remember { mutableStateOf(false) }
    val prefs = remember { context.getSharedPreferences("BoringGalleryPrefs", Context.MODE_PRIVATE) }

    var allMedia by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
    var favoriteUris by remember { mutableStateOf(prefs.getStringSet("favorites", emptySet())?.toSet() ?: emptySet()) }
    var trashUris by remember { mutableStateOf(prefs.getStringSet("trash", emptySet())?.toSet() ?: emptySet()) }
    var vaultUris by remember { mutableStateOf(prefs.getStringSet("vault", emptySet())?.toSet() ?: emptySet()) }
    var vaultPin by remember { mutableStateOf(prefs.getString("vaultPin", null)) }

    val customAlbums = remember { mutableStateMapOf<String, CustomAlbum>() }
    val dragDropController = remember { DragDropController() }

    LaunchedEffect(favoriteUris) { prefs.edit().putStringSet("favorites", favoriteUris).apply() }
    LaunchedEffect(trashUris) { prefs.edit().putStringSet("trash", trashUris).apply() }
    LaunchedEffect(vaultUris) { prefs.edit().putStringSet("vault", vaultUris).apply() }
    LaunchedEffect(vaultPin) { prefs.edit().putString("vaultPin", vaultPin).apply() }

    fun saveCustomAlbums() {
        prefs.edit().apply {
            putStringSet("custom_albums_ids", customAlbums.keys)
            customAlbums.forEach { (id, album) ->
                putString("custom_album_name_$id", album.name)
                putStringSet("custom_album_media_$id", album.mediaUris)
            }
        }.apply()
    }

    fun refreshMedia() {
        if (!hasPermission) return
        coroutineScope.launch {
            delay(100) // 稍短的延迟，让刷新更跟手
            val loadedMedia = withContext(Dispatchers.IO) { loadMediaFilesAsync(context) }
            allMedia = loadedMedia
            val validUris = loadedMedia.map { it.uri }.toSet()
            favoriteUris = favoriteUris.intersect(validUris)
            trashUris = trashUris.intersect(validUris)
            vaultUris = vaultUris.intersect(validUris)

            val albumIds = prefs.getStringSet("custom_albums_ids", emptySet()) ?: emptySet()
            val loadedCustomAlbums = albumIds.associateWith { id ->
                CustomAlbum(id = id, name = prefs.getString("custom_album_name_$id", "未知相册") ?: "未知相册", mediaUris = (prefs.getStringSet("custom_album_media_$id", emptySet()) ?: emptySet()).intersect(validUris))
            }
            customAlbums.clear()
            customAlbums.putAll(loadedCustomAlbums)
        }
    }

    // 生命周期与切页监听：🌟 每次回到长河页面，强制刷新，解决截图后不显示的痛点！
    var currentTab by remember { mutableIntStateOf(0) }

    LaunchedEffect(currentTab) {
        if (currentTab == 0) refreshMedia()
    }

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) refreshMedia() }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    var currentAlbumId by remember { mutableStateOf<String?>(null) }
    var isVaultUnlocked by remember { mutableStateOf(false) }
    var selectedUri by remember { mutableStateOf<String?>(null) }
    var isSelectionMode by remember { mutableStateOf(false) }
    var selectedItems by remember { mutableStateOf<Set<String>>(emptySet()) }
    var pendingDeleteUris by remember { mutableStateOf<List<String>>(emptyList()) }

    var showCreateAlbumDialog by remember { mutableStateOf(false) }
    var showMoveToDialog by remember { mutableStateOf(false) }
    var albumToDelete by remember { mutableStateOf<CustomAlbum?>(null) } // 🌟 控制删除相册的弹窗

    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {}
    val deleteLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val toRemove = pendingDeleteUris.toSet()
            allMedia = allMedia.filter { it.uri !in toRemove }
            trashUris = trashUris - toRemove
            favoriteUris = favoriteUris - toRemove
            vaultUris = vaultUris - toRemove
            selectedItems = emptySet()
            isSelectionMode = false
            customAlbums.forEach { (id, album) -> customAlbums[id] = album.copy(mediaUris = album.mediaUris - toRemove) }
            saveCustomAlbums()
            Toast.makeText(context, "操作成功", Toast.LENGTH_SHORT).show()
        }
        pendingDeleteUris = emptyList()
    }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { permissions -> hasPermission = permissions.values.any { it }; if (hasPermission) refreshMedia() }

    LaunchedEffect(Unit) {
        val permissions = mutableListOf(Manifest.permission.ACCESS_MEDIA_LOCATION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) { permissions.add(Manifest.permission.READ_MEDIA_IMAGES); permissions.add(Manifest.permission.READ_MEDIA_VIDEO) }
        else permissions.add(Manifest.permission.READ_EXTERNAL_STORAGE)
        permissionLauncher.launch(permissions.toTypedArray())
    }

    // 🌟 计算被分配到自定义相册的所有照片
    val allCustomUris = remember(customAlbums.values.map { it.mediaUris }) { customAlbums.values.flatMap { it.mediaUris }.toSet() }

    val displayMedia = remember(allMedia, favoriteUris, trashUris, vaultUris, customAlbums, currentTab, currentAlbumId) {
        when {
            currentTab == 0 -> allMedia.filter { it.uri !in trashUris && it.uri !in vaultUris }
            // 🌟 核心逻辑：默认相册 = 所有照片 排除（回收站 + 保险柜 + 任何自定义相册）
            currentTab == 1 && currentAlbumId == "DEFAULT" -> allMedia.filter { it.uri !in trashUris && it.uri !in vaultUris && it.uri !in allCustomUris }
            currentTab == 1 && currentAlbumId == "FAVORITES" -> allMedia.filter { it.uri in favoriteUris && it.uri !in trashUris && it.uri !in vaultUris }
            currentTab == 1 && currentAlbumId == "TRASH" -> allMedia.filter { it.uri in trashUris }
            currentTab == 1 && currentAlbumId == "VAULT" -> allMedia.filter { it.uri in vaultUris }
            currentTab == 1 && currentAlbumId == "FLOATING" -> allMedia.filter { !it.hasLocation && it.uri !in trashUris && it.uri !in vaultUris }
            currentTab == 1 && currentAlbumId?.startsWith("CUSTOM_") == true -> {
                val id = currentAlbumId!!.removePrefix("CUSTOM_")
                val uris = customAlbums[id]?.mediaUris ?: emptySet()
                allMedia.filter { it.uri in uris }
            }
            else -> emptyList()
        }
    }

    // 工具函数：互斥分配算法 (将其移入或移出指定相册)
    fun moveItemsToAlbum(uris: Set<String>, targetAlbumId: String) {
        // 第一步：毫无保留地从所有其他自定义相册中剔除
        customAlbums.forEach { (id, album) ->
            customAlbums[id] = album.copy(mediaUris = album.mediaUris - uris)
        }
        // 第二步：如果目标不是 DEFAULT，则加入目标相册
        if (targetAlbumId != "DEFAULT") {
            val realId = targetAlbumId.removePrefix("CUSTOM_")
            customAlbums[realId]?.let {
                customAlbums[realId] = it.copy(mediaUris = it.mediaUris + uris)
            }
        }
        saveCustomAlbums()
    }

    if (showCreateAlbumDialog) {
        CreateAlbumDialog(onDismiss = { showCreateAlbumDialog = false }, onCreate = { name -> showCreateAlbumDialog = false; val id = UUID.randomUUID().toString(); customAlbums[id] = CustomAlbum(id, name, emptySet()); saveCustomAlbums(); Toast.makeText(context, "相册 $name 新建成功", Toast.LENGTH_SHORT).show() })
    }

    if (showMoveToDialog) {
        MoveToAlbumDialog(customAlbums = customAlbums.values.toList(), onDismiss = { showMoveToDialog = false }, onCreateNew = { showMoveToDialog = false; showCreateAlbumDialog = true },
            onSelect = { albumId ->
                moveItemsToAlbum(selectedItems, albumId)
                Toast.makeText(context, "已移动 ${selectedItems.size} 项", Toast.LENGTH_SHORT).show()
                showMoveToDialog = false; isSelectionMode = false; selectedItems = emptySet()
            })
    }

    // 🌟 删除相册弹窗
    if (albumToDelete != null) {
        DeleteAlbumDialog(
            album = albumToDelete!!,
            onDismiss = { albumToDelete = null },
            onDeleteMoveToDefault = { album ->
                customAlbums.remove(album.id)
                prefs.edit().remove("custom_album_name_${album.id}").remove("custom_album_media_${album.id}").apply()
                saveCustomAlbums()
                albumToDelete = null
                Toast.makeText(context, "相册已删除，照片已退回默认", Toast.LENGTH_SHORT).show()
            },
            onDeleteAndTrashPhotos = { album ->
                trashUris = trashUris + album.mediaUris // 把照片打入冷宫
                customAlbums.remove(album.id)
                prefs.edit().remove("custom_album_name_${album.id}").remove("custom_album_media_${album.id}").apply()
                saveCustomAlbums()
                albumToDelete = null
                Toast.makeText(context, "相册已删除，照片已移入回收站", Toast.LENGTH_SHORT).show()
            }
        )
    }

    Box(modifier = Modifier.fillMaxSize()) {
        if (hasPermission) {
            Scaffold(
                topBar = {
                    AnimatedVisibility(visible = isSelectionMode, enter = slideInVertically() + fadeIn(), exit = slideOutVertically() + fadeOut()) {
                        TopAppBar(
                            title = { Text("已选 ${selectedItems.size} 项", fontSize = 18.sp) },
                            navigationIcon = { IconButton(onClick = { isSelectionMode = false; selectedItems = emptySet() }) { Icon(Icons.Default.Close, "取消") } },
                            actions = {
                                if (currentAlbumId == "TRASH") {
                                    IconButton(onClick = { trashUris = trashUris - selectedItems; isSelectionMode = false; selectedItems = emptySet(); Toast.makeText(context, "批量恢复成功", Toast.LENGTH_SHORT).show() }) { Icon(Icons.Default.Restore, "恢复") }
                                    IconButton(onClick = { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) { val pendingIntent = MediaStore.createDeleteRequest(context.contentResolver, selectedItems.map { Uri.parse(it) }); pendingDeleteUris = selectedItems.toList(); deleteLauncher.launch(IntentSenderRequest.Builder(pendingIntent).build()) } else Toast.makeText(context, "需要 Android 11+", Toast.LENGTH_SHORT).show() }) { Icon(Icons.Default.DeleteForever, "彻底删除") }
                                } else {
                                    // 🌟 移出当前自定义相册功能（退回默认）
                                    if (currentAlbumId?.startsWith("CUSTOM_") == true) {
                                        IconButton(onClick = {
                                            moveItemsToAlbum(selectedItems, "DEFAULT")
                                            Toast.makeText(context, "已移回默认相册", Toast.LENGTH_SHORT).show()
                                            isSelectionMode = false; selectedItems = emptySet()
                                        }) { Icon(Icons.AutoMirrored.Filled.ExitToApp, "移出相册", tint = Color(0xFFE57373)) }
                                    }
                                    IconButton(onClick = { showMoveToDialog = true }) { Icon(Icons.Default.DriveFileMove, "移动", tint = MaterialTheme.colorScheme.primary) }
                                    IconButton(onClick = { val allAreFavs = selectedItems.all { it in favoriteUris }; favoriteUris = if (allAreFavs) favoriteUris - selectedItems else favoriteUris + selectedItems; isSelectionMode = false; selectedItems = emptySet(); Toast.makeText(context, if (allAreFavs) "已取消收藏" else "收藏成功", Toast.LENGTH_SHORT).show() }) { Icon(if (selectedItems.all { it in favoriteUris } && selectedItems.isNotEmpty()) Icons.Default.Favorite else Icons.Default.FavoriteBorder, "收藏", tint = if (selectedItems.all { it in favoriteUris } && selectedItems.isNotEmpty()) Color.Red else LocalContentColor.current) }
                                    IconButton(onClick = { trashUris = trashUris + selectedItems; favoriteUris = favoriteUris - selectedItems; vaultUris = vaultUris - selectedItems; isSelectionMode = false; selectedItems = emptySet(); Toast.makeText(context, "已移入回收站", Toast.LENGTH_SHORT).show() }) { Icon(Icons.Default.Delete, "删除") }
                                }
                            }, colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                        )
                    }
                },
                floatingActionButton = { if (currentTab == 0 && selectedUri == null && !isSelectionMode) FloatingActionButton(onClick = { cameraLauncher.launch(Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA)) }, containerColor = MaterialTheme.colorScheme.primary) { Icon(Icons.Default.CameraAlt, "拍照", tint = Color.White) } },
                bottomBar = {
                    if (selectedUri == null && !isSelectionMode) {
                        NavigationBar {
                            NavigationBarItem(icon = { Icon(Icons.Default.Photo, "长河") }, label = { Text("长河") }, selected = currentTab == 0, onClick = { currentTab = 0; currentAlbumId = null; isVaultUnlocked = false })
                            NavigationBarItem(icon = { Icon(Icons.Default.PhotoAlbum, "相册") }, label = { Text("相册") }, selected = currentTab == 1, onClick = { currentTab = 1; currentAlbumId = null; isVaultUnlocked = false })
                            NavigationBarItem(icon = { Icon(Icons.Default.Public, "空间") }, label = { Text("空间") }, selected = currentTab == 2, onClick = { currentTab = 2; currentAlbumId = null; isVaultUnlocked = false })
                        }
                    }
                }
            ) { padding ->
                if (isSelectionMode) BackHandler { isSelectionMode = false; selectedItems = emptySet() }
                Box(modifier = Modifier.padding(padding).fillMaxSize()) {
                    when (currentTab) {
                        0 -> TimelineGridScreen(displayMedia, isSelectionMode, selectedItems, onToggleSelect = { uri -> selectedItems = if (uri in selectedItems) selectedItems - uri else selectedItems + uri }, onLongPress = { uri -> isSelectionMode = true; selectedItems = setOf(uri) }) { if (isSelectionMode) selectedItems = if (it in selectedItems) selectedItems - it else selectedItems + it else selectedUri = it }
                        1 -> {
                            if (currentAlbumId == null) {
                                // 默认相册的数量统计
                                val defaultUris = allMedia.filter { it.uri !in trashUris && it.uri !in vaultUris && it.uri !in allCustomUris }.map { it.uri }
                                AlbumsScreen(
                                    favoriteUris = favoriteUris.filter { it !in trashUris && it !in vaultUris },
                                    defaultUris = defaultUris,
                                    trashCount = trashUris.size, vaultCount = vaultUris.size,
                                    customAlbums = customAlbums,
                                    onCreateClick = { showCreateAlbumDialog = true },
                                    onAlbumClick = { currentAlbumId = it },
                                    onDeleteAlbumClick = { album -> albumToDelete = album } // 🌟 传入删除回调
                                )
                            } else if (currentAlbumId == "VAULT" && !isVaultUnlocked) VaultAuthScreen(savedPin = vaultPin, onSetPin = { newPin -> vaultPin = newPin; isVaultUnlocked = true }, onUnlock = { isVaultUnlocked = true }, onBack = { currentAlbumId = null })
                            else {
                                if (!isSelectionMode) BackHandler { currentAlbumId = null; isVaultUnlocked = false }
                                Column {
                                    if (!isSelectionMode) {
                                        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回", modifier = Modifier.clickable { currentAlbumId = null; isVaultUnlocked = false }.padding(end = 16.dp))
                                            val title = when {
                                                currentAlbumId == "DEFAULT" -> "默认相册"; currentAlbumId == "FAVORITES" -> "我的收藏"; currentAlbumId == "TRASH" -> "回收站"; currentAlbumId == "VAULT" -> "保险柜"; currentAlbumId == "FLOATING" -> "浮游相册"
                                                currentAlbumId?.startsWith("CUSTOM_") == true -> customAlbums[currentAlbumId!!.removePrefix("CUSTOM_")]?.name ?: ""
                                                else -> ""
                                            }
                                            Text(title, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                                        }
                                    }
                                    TimelineGridScreen(displayMedia, isSelectionMode, selectedItems, onToggleSelect = { uri -> selectedItems = if (uri in selectedItems) selectedItems - uri else selectedItems + uri }, onLongPress = { uri -> isSelectionMode = true; selectedItems = setOf(uri) }) { if (isSelectionMode) selectedItems = if (it in selectedItems) selectedItems - it else selectedItems + it else selectedUri = it }
                                }
                            }
                        }
                        2 -> MapSpaceScreen(allMedia.filter { it.uri !in trashUris && it.uri !in vaultUris }) { currentTab = 1; currentAlbumId = "FLOATING" }
                    }
                }
            }

            AnimatedVisibility(visible = selectedUri != null, enter = scaleIn(initialScale = 0.8f, animationSpec = tween(300)) + fadeIn(tween(300)), exit = scaleOut(targetScale = 0.8f, animationSpec = tween(250)) + fadeOut(tween(250))) {
                selectedUri?.let { uri ->
                    val initialIndex = displayMedia.indexOfFirst { it.uri == uri }.coerceAtLeast(0)
                    FullScreenZoomablePager(
                        mediaItems = displayMedia, initialIndex = initialIndex, favoriteUris = favoriteUris, isVaultMode = currentAlbumId == "VAULT", dragDropController = dragDropController, onBack = { selectedUri = null },
                        onAction = { actionType, targetUri, extraData ->
                            val currentIndex = displayMedia.indexOfFirst { it.uri == targetUri }
                            val isRemovingCustom = currentAlbumId?.startsWith("CUSTOM_") == true

                            val willBeRemoved = actionType == "DELETE" || actionType == "VAULT" ||
                                    (actionType == "FAVORITE" && currentAlbumId == "FAVORITES") ||
                                    (actionType == "FAVORITE" && currentAlbumId == "TRASH") ||
                                    (actionType == "REMOVE_FROM_CUSTOM" && isRemovingCustom) ||
                                    (actionType == "DROP" && extraData == "DEFAULT" && isRemovingCustom) ||
                                    (actionType == "DROP" && extraData != null && extraData != currentAlbumId) // 如果被挪到了别的地方，当前相册必定消失

                            if (willBeRemoved) { if (displayMedia.size <= 1) selectedUri = null else { val nextIndex = if (currentIndex == displayMedia.lastIndex) currentIndex - 1 else currentIndex + 1; selectedUri = displayMedia[nextIndex].uri } }

                            when (actionType) {
                                "DELETE" -> {
                                    if (currentAlbumId == "TRASH") {
                                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) { val pendingIntent = MediaStore.createDeleteRequest(context.contentResolver, listOf(Uri.parse(targetUri))); pendingDeleteUris = listOf(targetUri); deleteLauncher.launch(IntentSenderRequest.Builder(pendingIntent).build()) } else Toast.makeText(context, "需要 Android 11+", Toast.LENGTH_SHORT).show()
                                    } else { trashUris = trashUris + targetUri; favoriteUris = favoriteUris - targetUri; vaultUris = vaultUris - targetUri; moveItemsToAlbum(setOf(targetUri), "TRASH_VIRTUAL"); Toast.makeText(context, "已移入回收站", Toast.LENGTH_SHORT).show() }
                                }
                                "FAVORITE" -> { if (currentAlbumId == "TRASH") { trashUris = trashUris - targetUri; Toast.makeText(context, "已恢复", Toast.LENGTH_SHORT).show() } else { favoriteUris = if (targetUri in favoriteUris) favoriteUris - targetUri else favoriteUris + targetUri; if (targetUri in favoriteUris) Toast.makeText(context, "已收藏", Toast.LENGTH_SHORT).show() } }
                                "VAULT" -> { if (targetUri in vaultUris) { vaultUris = vaultUris - targetUri; Toast.makeText(context, "已移出保险柜", Toast.LENGTH_SHORT).show() } else { if (vaultPin == null) Toast.makeText(context, "请先在相册中设置保险柜密码", Toast.LENGTH_LONG).show() else { vaultUris = vaultUris + targetUri; moveItemsToAlbum(setOf(targetUri), "VAULT_VIRTUAL"); Toast.makeText(context, "已移入保险柜", Toast.LENGTH_SHORT).show() } } }
                                "DROP" -> {
                                    val targetId = extraData ?: return@FullScreenZoomablePager
                                    moveItemsToAlbum(setOf(targetUri), targetId)
                                    val toastMsg = if(targetId == "DEFAULT") "已移回默认相册" else "已放入相册"
                                    Toast.makeText(context, toastMsg, Toast.LENGTH_SHORT).show()
                                }
                            }
                        }
                    )
                }
            }
        } else Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("请授予相册权限~") }

        // ================= 🌟 星轨式动态透明拖拽层 =================
        if (dragDropController.isDragging) {
            val density = LocalDensity.current
            BoxWithConstraints(modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.75f))) {
                val screenWidthPx = constraints.maxWidth.toFloat()
                val screenHeightPx = constraints.maxHeight.toFloat()
                val centerX = screenWidthPx / 2f
                val centerY = screenHeightPx / 2f
                val orbitRadius = with(density) { 150.dp.toPx() }

                val orbitReveal by animateFloatAsState(targetValue = if (dragDropController.isDragging) 1f else 0f, animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessLow), label = "orbit")

                val dropTargetsList = listOf(CustomAlbum("DEFAULT", "默认", emptySet())) + customAlbums.values
                val angleStep = (2 * PI) / dropTargetsList.size

                dropTargetsList.forEachIndexed { index, album ->
                    val angle = index * angleStep - (PI / 2)
                    val ballX = centerX + (orbitRadius * orbitReveal) * cos(angle)
                    val ballY = centerY + (orbitRadius * orbitReveal) * sin(angle)
                    val isHovered = dragDropController.hoveredAlbumId == album.id
                    val isDefault = album.id == "DEFAULT"

                    val animatedSize by animateDpAsState(targetValue = if (isHovered) 100.dp else 70.dp, animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy))
                    val animatedAlpha by animateFloatAsState(targetValue = if (isHovered) 0.85f else 0.25f)
                    val animatedTextScale by animateFloatAsState(targetValue = if (isHovered) 1.25f else 1f)

                    Box(
                        modifier = Modifier
                            .offset { IntOffset((ballX - with(density) { animatedSize.toPx() } / 2).roundToInt(), (ballY - with(density) { animatedSize.toPx() } / 2).roundToInt()) }
                            .size(animatedSize)
                            .clip(CircleShape)
                            .background(if (isDefault) Color(0xFF9575CD).copy(alpha = animatedAlpha + 0.1f) else Color.White.copy(alpha = animatedAlpha))
                            .border(width = if (isHovered) 3.dp else 1.5.dp, color = Color.White.copy(alpha = if (isHovered) 1f else 0.5f), shape = CircleShape)
                            .onGloballyPositioned { coords -> dragDropController.dropTargets[album.id] = coords.boundsInRoot() },
                        contentAlignment = Alignment.Center
                    ) {
                        Text(text = album.name.take(2).uppercase(), fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = Color.White, modifier = Modifier.graphicsLayer { scaleX = animatedTextScale; scaleY = animatedTextScale })
                    }
                }

                dragDropController.dragItemUri?.let { uri ->
                    AsyncImage(
                        model = uri, contentDescription = "悬浮照片", contentScale = ContentScale.Fit,
                        modifier = Modifier
                            .offset { IntOffset(dragDropController.dragItemPositionInRoot.x.roundToInt(), dragDropController.dragItemPositionInRoot.y.roundToInt()) }
                            .size(with(density) { dragDropController.initialPhotoBounds.width.toDp() }, with(density) { dragDropController.initialPhotoBounds.height.toDp() })
                            .graphicsLayer { scaleX = 0.35f; scaleY = 0.35f; rotationZ = 6f; alpha = 0.95f }
                    )
                }
            }
        }
    }
}

// ============== 弹窗及 UI 碎片 ==============
@Composable
fun CreateAlbumDialog(onDismiss: () -> Unit, onCreate: (String) -> Unit) {
    var name by remember { mutableStateOf("") }
    Dialog(onDismissRequest = onDismiss) {
        Card(modifier = Modifier.fillMaxWidth().padding(16.dp), shape = RoundedCornerShape(20.dp)) {
            Column(modifier = Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("新建自定义相册", fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(16.dp))
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("相册名称") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(modifier = Modifier.height(24.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) { TextButton(onClick = onDismiss, modifier = Modifier.weight(1f)) { Text("取消", color = Color.Gray) }; Button(onClick = { if (name.isNotBlank()) onCreate(name) }, enabled = name.isNotBlank(), modifier = Modifier.weight(1f)) { Text("新建") } }
            }
        }
    }
}

@Composable
fun DeleteAlbumDialog(album: CustomAlbum, onDismiss: () -> Unit, onDeleteMoveToDefault: (CustomAlbum) -> Unit, onDeleteAndTrashPhotos: (CustomAlbum) -> Unit) {
    Dialog(onDismissRequest = onDismiss) {
        Card(modifier = Modifier.fillMaxWidth().padding(16.dp), shape = RoundedCornerShape(20.dp)) {
            Column(modifier = Modifier.padding(24.dp)) {
                Text("删除相册", fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Text("即将删除相册 \"${album.name}\"，里面的照片要如何处理？", modifier = Modifier.padding(top = 12.dp, bottom = 24.dp))

                Button(onClick = { onDeleteMoveToDefault(album) }, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)) { Text("仅删除相册 (照片退回默认)") }
                Spacer(modifier = Modifier.height(8.dp))
                Button(onClick = { onDeleteAndTrashPhotos(album) }, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)) { Text("一并删除 (照片移入回收站)") }
                Spacer(modifier = Modifier.height(8.dp))
                TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) { Text("取消", color = Color.Gray) }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MoveToAlbumDialog(customAlbums: List<CustomAlbum>, onDismiss: () -> Unit, onCreateNew: () -> Unit, onSelect: (String) -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(modifier = Modifier.fillMaxWidth().padding(bottom = 32.dp)) {
            Text("移动到...", fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(16.dp))
            LazyColumn(modifier = Modifier.fillMaxWidth()) {
                // 🌟 新增默认相册选项
                item { ListItem(headlineContent = { Text("默认相册", fontWeight = FontWeight.Bold) }, leadingContent = { Icon(Icons.Default.PhotoLibrary, contentDescription = null, tint = Color(0xFF9575CD)) }, modifier = Modifier.clickable { onSelect("DEFAULT") }) }
                items(customAlbums) { album -> ListItem(headlineContent = { Text(album.name) }, leadingContent = { Icon(Icons.Default.PhotoAlbum, contentDescription = null, tint = MaterialTheme.colorScheme.primary) }, modifier = Modifier.clickable { onSelect("CUSTOM_${album.id}") }) }
                item { ListItem(headlineContent = { Text("新建相册...", color = MaterialTheme.colorScheme.primary) }, leadingContent = { Icon(Icons.Default.Add, contentDescription = null, tint = MaterialTheme.colorScheme.primary) }, modifier = Modifier.clickable { onCreateNew() }) }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TimelineGridScreen(mediaItems: List<MediaItem>, isSelectionMode: Boolean, selectedItems: Set<String>, onToggleSelect: (String) -> Unit, onLongPress: (String) -> Unit, onPhotoClick: (String) -> Unit) {
    val context = LocalContext.current
    val imageLoader = remember { ImageLoader.Builder(context).components { add(VideoFrameDecoder.Factory()) }.build() }
    if (mediaItems.isEmpty()) Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("空空如也~", color = Color.Gray, fontStyle = FontStyle.Italic) }
    else {
        LazyVerticalStaggeredGrid(columns = StaggeredGridCells.Adaptive(130.dp), contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 8.dp, bottom = 80.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalItemSpacing = 8.dp, modifier = Modifier.fillMaxSize()) {
            mediaItems.groupBy { it.date }.forEach { (date, items) ->
                item(span = StaggeredGridItemSpan.FullLine) { Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 24.dp)) { Text(text = "— $date —", fontWeight = FontWeight.Light, fontSize = 14.sp, color = Color.Gray, fontStyle = FontStyle.Italic) } }
                items(items, key = { it.uri }) { item ->
                    val randomHeight = 120 + (abs(item.uri.hashCode()) % 130)
                    Box(modifier = Modifier.height(randomHeight.dp).clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)).combinedClickable(onLongClick = { onLongPress(item.uri) }, onClick = { onPhotoClick(item.uri) })) {
                        AsyncImage(model = ImageRequest.Builder(context).data(item.uri).crossfade(true).build(), imageLoader = imageLoader, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                        if (item.isVideo) Icon(Icons.Default.PlayCircle, "视频", tint = Color.White, modifier = Modifier.align(Alignment.BottomStart).padding(8.dp).size(28.dp))
                        if (isSelectionMode) { Box(modifier = Modifier.fillMaxSize().background(if (item.uri in selectedItems) Color.Black.copy(alpha = 0.4f) else Color.Transparent)); Icon(if (item.uri in selectedItems) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked, contentDescription = "选择", tint = if (item.uri in selectedItems) MaterialTheme.colorScheme.primary else Color.White, modifier = Modifier.align(Alignment.TopEnd).padding(8.dp).size(28.dp)) }
                    }
                }
            }
        }
    }
}

@Composable
fun MapSpaceScreen(mediaItems: List<MediaItem>, onFloatingClick: () -> Unit) {
    val locatedMedia = mediaItems.filter { it.hasLocation }
    val floatingMedia = mediaItems.filter { !it.hasLocation }
    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) { Icon(Icons.Default.Public, "地球", modifier = Modifier.size(100.dp), tint = Color(0xFF64B5F6)); Spacer(modifier = Modifier.height(16.dp)); Text("3D 地球视图开发中", fontSize = 18.sp, fontWeight = FontWeight.Bold); Text("已记录 ${locatedMedia.size} 个媒体定位", color = Color.Gray, modifier = Modifier.padding(top = 8.dp)) }
        if (floatingMedia.isNotEmpty()) {
            Column(modifier = Modifier.align(Alignment.TopEnd).padding(16.dp).clickable { onFloatingClick() }, horizontalAlignment = Alignment.CenterHorizontally) {
                Box(modifier = Modifier.size(64.dp), contentAlignment = Alignment.Center) { floatingMedia.take(3).map { it.uri }.reversed().forEachIndexed { index, uri -> val rotation = when(index) { 0 -> -15f; 1 -> 8f; else -> 0f }; AsyncImage(model = uri, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(56.dp).graphicsLayer { rotationZ = rotation }.background(Color.White, RoundedCornerShape(8.dp)).padding(2.dp).clip(RoundedCornerShape(6.dp))) } }
                Text("浮游", fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
fun AlbumsScreen(favoriteUris: List<String>, defaultUris: List<String>, trashCount: Int, vaultCount: Int, customAlbums: Map<String, CustomAlbum>, onCreateClick: () -> Unit, onAlbumClick: (String) -> Unit, onDeleteAlbumClick: (CustomAlbum) -> Unit) {
    LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp), contentPadding = PaddingValues(bottom = 80.dp)) {
        item { Text("管理与发现", fontSize = 28.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(bottom = 8.dp)) }
        item { AlbumCardItem(favoriteUris, Icons.Default.Favorite, "我的收藏", "${favoriteUris.size} 项精选", Color(0xFFE57373)) { onAlbumClick("FAVORITES") } }
        item { AlbumCardItem(defaultUris, Icons.Default.PhotoLibrary, "默认相册", "${defaultUris.size} 张照片", Color(0xFF9575CD)) { onAlbumClick("DEFAULT") } }
        item { AlbumCardItem(emptyList(), Icons.Default.Lock, "保险柜", "$vaultCount 个私密媒体", Color(0xFF81C784)) { onAlbumClick("VAULT") } }
        item { AlbumCardItem(emptyList(), Icons.Default.Delete, "回收站", "$trashCount 个待清理", Color(0xFF90A4AE)) { onAlbumClick("TRASH") } }

        if (customAlbums.isNotEmpty()) {
            item { Text("我的自定义相册", fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 24.dp, bottom = 8.dp)) }
            items(customAlbums.values.toList(), key = { it.id }) { album ->
                AlbumCardItem(
                    coverUris = album.mediaUris.toList(), fallbackIcon = Icons.Default.PhotoAlbum, title = album.name, subtitle = "${album.mediaUris.size} 个媒体", iconColor = Color(0xFF64B5F6),
                    onDeleteClick = { onDeleteAlbumClick(album) }, // 🌟 显式命名传参
                    onClick = { onAlbumClick("CUSTOM_${album.id}") }
                )
            }
        }
        item {
            Card(modifier = Modifier.fillMaxWidth().clickable { onCreateClick() }.padding(top = 16.dp), shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)), border = BorderStroke(2.dp, MaterialTheme.colorScheme.primary)) {
                Row(modifier = Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.AddCircleOutline, contentDescription = "新建相册", modifier = Modifier.size(36.dp), tint = MaterialTheme.colorScheme.primary); Spacer(modifier = Modifier.width(16.dp)); Text(text = "新建一个自定义相册~", fontSize = 16.sp, color = MaterialTheme.colorScheme.onPrimaryContainer, fontWeight = FontWeight.Bold) }
            }
        }
    }
}

// 🌟 修复点：将 onClick 挪到了参数列表的最末尾
@Composable
fun AlbumCardItem(coverUris: List<String>, fallbackIcon: ImageVector, title: String, subtitle: String, iconColor: Color, onDeleteClick: (() -> Unit)? = null, onClick: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().clickable { onClick() }, shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.size(64.dp), contentAlignment = Alignment.Center) {
                if (coverUris.isEmpty()) { Box(modifier = Modifier.size(56.dp).background(iconColor.copy(alpha = 0.2f), RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) { Icon(imageVector = fallbackIcon, contentDescription = null, tint = iconColor, modifier = Modifier.size(32.dp)) } }
                else { coverUris.take(3).reversed().forEachIndexed { index, uri -> val rotation = when(index) { 0 -> -15f; 1 -> 8f; else -> 0f }; AsyncImage(model = uri, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(56.dp).graphicsLayer { rotationZ = rotation }.background(Color.White, RoundedCornerShape(8.dp)).padding(2.dp).clip(RoundedCornerShape(6.dp))) } }
            }
            Spacer(modifier = Modifier.width(20.dp))
            Column(modifier = Modifier.weight(1f)) { Text(text = title, fontSize = 20.sp, fontWeight = FontWeight.Bold); Text(text = subtitle, fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }

            if (onDeleteClick != null) {
                IconButton(onClick = onDeleteClick) { Icon(Icons.Default.DeleteOutline, contentDescription = "删除相册", tint = Color.Gray) }
            }
        }
    }
}

@Composable
fun FullScreenZoomablePager(mediaItems: List<MediaItem>, initialIndex: Int, favoriteUris: Set<String>, isVaultMode: Boolean, dragDropController: DragDropController, onBack: () -> Unit, onAction: (String, String, String?) -> Unit) {
    BackHandler(onBack = onBack)
    var targetPage by remember(initialIndex, mediaItems.size) { mutableIntStateOf(initialIndex.coerceIn(0, (mediaItems.size - 1).coerceAtLeast(0))) }
    val pagerState = rememberPagerState(initialPage = targetPage, pageCount = { mediaItems.size })
    val context = LocalContext.current
    val imageLoader = remember { ImageLoader.Builder(context).components { add(VideoFrameDecoder.Factory()) }.build() }

    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        HorizontalPager(state = pagerState, modifier = Modifier.fillMaxSize(), key = { mediaItems[it].uri }) { page ->
            if (page < mediaItems.size) {
                val item = mediaItems[page]
                ZoomableSwipeableImage(
                    uri = item.uri, isVideo = item.isVideo, imageLoader = imageLoader, isFavorite = favoriteUris.contains(item.uri), dragDropController = dragDropController,
                    onSwipeUp = { onAction("FAVORITE", item.uri, null) }, onSwipeDown = { onAction("DELETE", item.uri, null) }, onDrop = { targetId -> onAction("DROP", item.uri, targetId) },
                    onVideoPlay = { val intent = Intent(Intent.ACTION_VIEW).apply { setDataAndType(Uri.parse(item.uri), "video/*"); addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) }; context.startActivity(intent) }
                )
            }
        }
        Row(modifier = Modifier.fillMaxWidth().padding(top = 48.dp, start = 16.dp, end = 16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回", tint = Color.White) }
            if (mediaItems.isNotEmpty() && pagerState.currentPage < mediaItems.size) { IconButton(onClick = { onAction("VAULT", mediaItems[pagerState.currentPage].uri, null) }) { Icon(if (isVaultMode) Icons.Default.LockOpen else Icons.Default.Lock, contentDescription = "保险柜", tint = Color.White) } }
        }
    }
}

@Composable
fun ZoomableSwipeableImage(uri: String, isVideo: Boolean, imageLoader: ImageLoader, isFavorite: Boolean, dragDropController: DragDropController, onSwipeUp: () -> Unit, onSwipeDown: () -> Unit, onDrop: (String) -> Unit, onVideoPlay: () -> Unit) {
    val coroutineScope = rememberCoroutineScope()
    val offsetY = remember { Animatable(0f) }
    var zoomScale by remember { mutableFloatStateOf(1f) }
    var panOffset by remember { mutableStateOf(Offset.Zero) }
    val swipeScale = 1f - (abs(offsetY.value) / 2500f).coerceIn(0f, 0.4f)
    val swipeAlpha = 1f - (abs(offsetY.value) / 1500f).coerceIn(0f, 0.6f)
    var photoBoundsInRoot by remember { mutableStateOf(Rect.Zero) }

    Box(modifier = Modifier.fillMaxSize()
        .onGloballyPositioned { coordinates -> photoBoundsInRoot = coordinates.boundsInRoot() }
        .pointerInput(Unit) { detectTapGestures(onDoubleTap = { zoomScale = if (zoomScale > 1f) 1f else 2.5f; panOffset = Offset.Zero }) }
        .pointerInput(Unit) {
            detectDragGesturesAfterLongPress(
                onDragStart = { if (zoomScale <= 1f) dragDropController.startDrag(uri, photoBoundsInRoot) },
                onDrag = { change, dragAmount -> if (dragDropController.isDragging) { change.consume(); dragDropController.updateDrag(dragAmount) } },
                onDragEnd = { if (dragDropController.isDragging) { val targetId = dragDropController.endDrag(); if (targetId != null) onDrop(targetId) } },
                onDragCancel = { dragDropController.endDrag() }
            )
        }
        .pointerInput(Unit) {
            awaitEachGesture {
                awaitFirstDown()
                do {
                    val event = awaitPointerEvent()
                    val zoom = event.calculateZoom()
                    val pan = event.calculatePan()
                    zoomScale = (zoomScale * zoom).coerceIn(1f, 5f)
                    if (zoomScale > 1f) { panOffset += pan; event.changes.forEach { it.consume() } } else { panOffset = Offset.Zero; if (event.changes.size > 1) event.changes.forEach { it.consume() } }
                } while (event.changes.any { it.pressed })
            }
        }
        .pointerInput(zoomScale) {
            if (zoomScale <= 1f) {
                detectVerticalDragGestures(
                    onDragEnd = { coroutineScope.launch { if (offsetY.value > 300f) { offsetY.animateTo(2000f, tween(300)); onSwipeDown(); offsetY.snapTo(0f) } else if (offsetY.value < -300f) { offsetY.animateTo(-2000f, tween(300)); onSwipeUp(); offsetY.snapTo(0f) } else { offsetY.animateTo(0f, spring(Spring.DampingRatioMediumBouncy, Spring.StiffnessLow)) } } },
                    onVerticalDrag = { change, dragAmount -> if (!dragDropController.isDragging) { change.consume(); coroutineScope.launch { offsetY.snapTo(offsetY.value + dragAmount * 0.8f) } } }
                )
            }
        }, contentAlignment = Alignment.Center
    ) {
        AsyncImage(model = uri, imageLoader = imageLoader, contentDescription = "大图", contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize().offset { IntOffset(0, offsetY.value.roundToInt()) }.graphicsLayer { scaleX = zoomScale * swipeScale; scaleY = zoomScale * swipeScale; translationX = panOffset.x; translationY = panOffset.y; alpha = swipeAlpha })
        if (isVideo) IconButton(onClick = onVideoPlay, modifier = Modifier.size(80.dp).background(Color.Black.copy(alpha = 0.5f), CircleShape)) { Icon(Icons.Default.PlayArrow, contentDescription = "播放", tint = Color.White, modifier = Modifier.size(48.dp)) }
        AnimatedVisibility(visible = isFavorite, enter = scaleIn(spring(Spring.DampingRatioHighBouncy)), exit = scaleOut(tween(200)), modifier = Modifier.align(Alignment.TopEnd).padding(top = 64.dp, end = 24.dp)) { Icon(Icons.Default.Favorite, "已收藏", tint = Color.Red, modifier = Modifier.size(36.dp)) }
    }
}

// ============== 密码锁与底层加载 ==============
@Composable
fun DialButton(text: String, onClick: () -> Unit) { Box(modifier = Modifier.size(72.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant).clickable { onClick() }, contentAlignment = Alignment.Center) { Text(text, fontSize = 28.sp, fontWeight = FontWeight.Medium) } }

@Composable
fun VaultAuthScreen(savedPin: String?, onSetPin: (String) -> Unit, onUnlock: () -> Unit, onBack: () -> Unit) {
    BackHandler(onBack = onBack)
    var pin by remember { mutableStateOf("") }; var tempPin by remember { mutableStateOf("") }; var showError by remember { mutableStateOf(false) }; var mode by remember { mutableStateOf(if (savedPin == null) "SET" else "UNLOCK") }
    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回") }; if (mode == "UNLOCK" && savedPin != null) { TextButton(onClick = { mode = "MODIFY_OLD"; pin = ""; tempPin = ""; showError = false }) { Text("修改密码", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold) } } }
        Column(modifier = Modifier.fillMaxSize().weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Icon(Icons.Default.Lock, contentDescription = "Lock", modifier = Modifier.size(64.dp), tint = MaterialTheme.colorScheme.primary); Spacer(modifier = Modifier.height(24.dp))
            Text(when (mode) { "UNLOCK" -> "请输入保险柜密码"; "MODIFY_OLD" -> "请输入旧密码验证身份"; "SET" -> "请设置 4 位新密码"; "CONFIRM" -> "请再次确认新密码"; else -> "" }, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Text(if (showError) "密码错误 / 两次输入不一致" else "", color = Color.Red, fontSize = 14.sp, modifier = Modifier.padding(top = 8.dp).height(20.dp), textAlign = TextAlign.Center); Spacer(modifier = Modifier.height(32.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) { repeat(4) { index -> Box(modifier = Modifier.size(16.dp).clip(CircleShape).background(if (showError) Color.Red else if (index < pin.length) MaterialTheme.colorScheme.primary else Color.LightGray)) } }; Spacer(modifier = Modifier.height(48.dp))
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                for (row in 0..2) { Row(horizontalArrangement = Arrangement.spacedBy(32.dp)) { for (col in 1..3) { val num = (row * 3 + col).toString(); DialButton(num) { handlePinLogic(num, mode, savedPin, pin, { pin = it }, tempPin, { tempPin = it }, { mode = it }, onUnlock, onSetPin, { showError = it }) } } } }
                Row(horizontalArrangement = Arrangement.spacedBy(32.dp)) { Spacer(modifier = Modifier.size(72.dp)); DialButton("0") { handlePinLogic("0", mode, savedPin, pin, { pin = it }, tempPin, { tempPin = it }, { mode = it }, onUnlock, onSetPin, { showError = it }) }; Box(modifier = Modifier.size(72.dp).clickable { if (pin.isNotEmpty()) pin = pin.dropLast(1); showError = false }, contentAlignment = Alignment.Center) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "删除", modifier = Modifier.size(32.dp)) } }
            }
        }
    }
}

fun handlePinLogic(num: String, mode: String, savedPin: String?, currentPin: String, updatePin: (String) -> Unit, tempPin: String, updateTempPin: (String) -> Unit, updateMode: (String) -> Unit, onUnlock: () -> Unit, onSetPin: (String) -> Unit, updateError: (Boolean) -> Unit) {
    updateError(false); if (currentPin.length >= 4) return; val newPin = currentPin + num; updatePin(newPin)
    if (newPin.length == 4) { when (mode) { "UNLOCK" -> if (newPin == savedPin) { updatePin(""); onUnlock() } else { updateError(true); updatePin("") }; "MODIFY_OLD" -> if (newPin == savedPin) { updateMode("SET"); updatePin(""); updateTempPin("") } else { updateError(true); updatePin("") }; "SET" -> { updateTempPin(newPin); updatePin(""); updateMode("CONFIRM") }; "CONFIRM" -> if (newPin == tempPin) { onSetPin(newPin); updatePin(""); updateTempPin(""); updateMode("UNLOCK") } else { updateError(true); updatePin(""); updateTempPin(""); updateMode("SET") } } }
}

fun loadMediaFilesAsync(context: android.content.Context): List<MediaItem> {
    val items = mutableListOf<MediaItem>(); val sdf = SimpleDateFormat("yyyy年MM月dd日", Locale.getDefault())
    context.contentResolver.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, arrayOf(MediaStore.Images.Media._ID, MediaStore.Images.Media.DATE_ADDED), null, null, null)?.use { cursor -> val idCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID); val dateCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED); while (cursor.moveToNext()) { val id = cursor.getLong(idCol); val uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id).toString(); val timestamp = cursor.getLong(dateCol); items.add(MediaItem(uri, sdf.format(Date(timestamp * 1000L)), (id % 5) != 0L, false, timestamp)) } }
    context.contentResolver.query(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, arrayOf(MediaStore.Video.Media._ID, MediaStore.Video.Media.DATE_ADDED), null, null, null)?.use { cursor -> val idCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media._ID); val dateCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DATE_ADDED); while (cursor.moveToNext()) { val id = cursor.getLong(idCol); val uri = ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id).toString(); val timestamp = cursor.getLong(dateCol); items.add(MediaItem(uri, sdf.format(Date(timestamp * 1000L)), (id % 5) != 0L, true, timestamp)) } }
    return items.sortedByDescending { it.timestamp }
}