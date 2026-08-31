import 'dart:async';
import 'dart:io';
import 'dart:ui';

import 'package:audioplayers/audioplayers.dart';
import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:google_mlkit_commons/google_mlkit_commons.dart';
import 'package:google_mlkit_pose_detection/google_mlkit_pose_detection.dart' as mlkit;
import 'package:permission_handler/permission_handler.dart';
import 'package:vibration/vibration.dart';

import '../../domain/entities/pose_landmark.dart' as domain;
import '../../domain/repositories/pose_detector_repository.dart';
import '../../domain/services/jump_counter.dart';
import '../../workout/workout_engine.dart';

class CameraPoseService implements PoseDetectorRepository {
  CameraPoseService({
    mlkit.PoseDetector? detector,
    JumpCounter? jumpCounter,
  })  : _detector = detector ??
            mlkit.PoseDetector(
              options: mlkit.PoseDetectorOptions(
                mode: mlkit.PoseDetectionMode.stream,
                model: mlkit.PoseDetectionModel.accurate,
              ),
            ),
        _jumpCounter = jumpCounter ?? JumpCounter();

  final mlkit.PoseDetector _detector;
  final JumpCounter _jumpCounter;
  final _poseController = StreamController<domain.PoseFrame>.broadcast();
  final _jumpController = StreamController<JumpCounterResult>.broadcast();

  CameraController? _cameraController;
  bool _isProcessing = false;
  bool _isStreaming = false;

  Stream<JumpCounterResult> get jumpResults => _jumpController.stream;

  JumpCounter get jumpCounter => _jumpCounter;

  @override
  Stream<domain.PoseFrame> get poseFrames => _poseController.stream;

  CameraController? get cameraController => _cameraController;

  Future<bool> initialize() async {
    final status = await Permission.camera.request();
    if (!status.isGranted) {
      return false;
    }

    final cameras = await availableCameras();
    final front = cameras.firstWhere(
      (camera) => camera.lensDirection == CameraLensDirection.front,
      orElse: () => cameras.first,
    );

    _cameraController = CameraController(
      front,
      ResolutionPreset.medium,
      enableAudio: false,
      imageFormatGroup: Platform.isAndroid ? ImageFormatGroup.nv21 : ImageFormatGroup.bgra8888,
    );

    await _cameraController!.initialize();
    return true;
  }

  @override
  Future<void> start() async {
    if (_cameraController == null || !_cameraController!.value.isInitialized) {
      throw StateError('Camera not initialized');
    }
    if (_isStreaming) return;

    _jumpCounter.reset();
    _isStreaming = true;
    await _cameraController!.startImageStream(_processCameraImage);
  }

  Future<void> _processCameraImage(CameraImage image) async {
    if (_isProcessing || !_isStreaming) return;
    _isProcessing = true;

    try {
      final inputImage = _buildInputImage(image);
      if (inputImage == null) return;

      final poses = await _detector.processImage(inputImage);
      if (poses.isEmpty) {
        _jumpController.add(
          JumpCounterResult(
            jumpDetected: false,
            bodyDetected: false,
            ropePhase: 0,
            groundHit: false,
            leftWrist: null,
            rightWrist: null,
            groundY: null,
          ),
        );
        return;
      }

      final frame = _mapPose(poses.first, image.width, image.height);
      _poseController.add(frame);
      _jumpController.add(_jumpCounter.process(frame));
    } catch (_) {
      // Ignora frames com falha pontual para manter fluidez.
    } finally {
      _isProcessing = false;
    }
  }

  InputImage? _buildInputImage(CameraImage image) {
    final controller = _cameraController;
    if (controller == null) return null;

    final rotation = _rotationIntToImageRotation(controller.description.sensorOrientation);

    if (Platform.isAndroid && image.format.group == ImageFormatGroup.nv21) {
      final bytes = _concatenatePlanes(image.planes);
      return InputImage.fromBytes(
        bytes: bytes,
        metadata: InputImageMetadata(
          size: Size(image.width.toDouble(), image.height.toDouble()),
          rotation: rotation,
          format: InputImageFormat.nv21,
          bytesPerRow: image.planes.first.bytesPerRow,
        ),
      );
    }

    if (Platform.isIOS) {
      if (image.planes.isEmpty) return null;
      return InputImage.fromBytes(
        bytes: image.planes.first.bytes,
        metadata: InputImageMetadata(
          size: Size(image.width.toDouble(), image.height.toDouble()),
          rotation: rotation,
          format: InputImageFormat.bgra8888,
          bytesPerRow: image.planes.first.bytesPerRow,
        ),
      );
    }

    return null;
  }

  Uint8List _concatenatePlanes(List<Plane> planes) {
    final buffer = WriteBuffer();
    for (final plane in planes) {
      buffer.putUint8List(plane.bytes);
    }
    return buffer.done().buffer.asUint8List();
  }

  InputImageRotation _rotationIntToImageRotation(int rotation) {
    switch (rotation) {
      case 90:
        return InputImageRotation.rotation90deg;
      case 180:
        return InputImageRotation.rotation180deg;
      case 270:
        return InputImageRotation.rotation270deg;
      default:
        return InputImageRotation.rotation0deg;
    }
  }

  domain.PoseFrame _mapPose(mlkit.Pose pose, int width, int height) {
    domain.PoseLandmark? map(
      domain.PoseLandmarkType type,
      mlkit.PoseLandmarkType mlType,
    ) {
      final landmark = pose.landmarks[mlType];
      if (landmark == null) return null;
      return domain.PoseLandmark(
        type: type,
        x: landmark.x / width,
        y: landmark.y / height,
        z: landmark.z,
        likelihood: landmark.likelihood,
      );
    }

    final landmarks = <domain.PoseLandmark>[
      if (map(domain.PoseLandmarkType.leftWrist, mlkit.PoseLandmarkType.leftWrist) case final l?) l,
      if (map(domain.PoseLandmarkType.rightWrist, mlkit.PoseLandmarkType.rightWrist) case final r?) r,
      if (map(domain.PoseLandmarkType.leftAnkle, mlkit.PoseLandmarkType.leftAnkle) case final la?) la,
      if (map(domain.PoseLandmarkType.rightAnkle, mlkit.PoseLandmarkType.rightAnkle) case final ra?) ra,
      if (map(domain.PoseLandmarkType.leftHip, mlkit.PoseLandmarkType.leftHip) case final lh?) lh,
      if (map(domain.PoseLandmarkType.rightHip, mlkit.PoseLandmarkType.rightHip) case final rh?) rh,
      if (map(domain.PoseLandmarkType.leftKnee, mlkit.PoseLandmarkType.leftKnee) case final lk?) lk,
      if (map(domain.PoseLandmarkType.rightKnee, mlkit.PoseLandmarkType.rightKnee) case final rk?) rk,
      if (map(domain.PoseLandmarkType.leftShoulder, mlkit.PoseLandmarkType.leftShoulder) case final ls?) ls,
      if (map(domain.PoseLandmarkType.rightShoulder, mlkit.PoseLandmarkType.rightShoulder) case final rs?) rs,
    ];

    return domain.PoseFrame(
      landmarks: landmarks,
      timestamp: DateTime.now(),
      imageWidth: width,
      imageHeight: height,
    );
  }

  @override
  Future<void> stop() async {
    _isStreaming = false;
    if (_cameraController != null && _cameraController!.value.isStreamingImages) {
      await _cameraController!.stopImageStream();
    }
  }

  @override
  void dispose() {
    stop();
    _detector.close();
    _cameraController?.dispose();
    _poseController.close();
    _jumpController.close();
  }
}

class WorkoutAudioService {
  WorkoutAudioService({
    this.ropeHitEnabled = true,
    this.transitionBeepsEnabled = true,
  });

  bool ropeHitEnabled;
  bool transitionBeepsEnabled;

  final AudioPlayer _ropePlayer = AudioPlayer();
  final AudioPlayer _fxPlayer = AudioPlayer();

  Future<void> playRopeHit() async {
    if (!ropeHitEnabled) return;
    await _ropePlayer.stop();
    await _ropePlayer.play(AssetSource('audio/rope_hit.wav'), volume: 0.85);
  }

  Future<void> handleNotification(WorkoutNotification notification) async {
    if (!transitionBeepsEnabled) return;

    switch (notification.type) {
      case WorkoutNotificationType.seriesComplete:
        await _fxPlayer.play(AssetSource('audio/beep_short.wav'), volume: 0.7);
      case WorkoutNotificationType.restStarted:
        await _fxPlayer.play(AssetSource('audio/beep_rest.wav'), volume: 0.7);
        await Vibration.vibrate(duration: 120);
      case WorkoutNotificationType.restEnding:
        await _fxPlayer.play(AssetSource('audio/beep_short.wav'), volume: 0.5);
      case WorkoutNotificationType.restComplete:
        await _fxPlayer.play(AssetSource('audio/beep_short.wav'), volume: 0.8);
        await Vibration.vibrate(duration: 180);
      case WorkoutNotificationType.workoutComplete:
        await _fxPlayer.play(AssetSource('audio/beep_complete.wav'), volume: 0.9);
        await Vibration.vibrate(pattern: [0, 120, 80, 200]);
      case WorkoutNotificationType.milestone:
        break;
    }
  }

  void dispose() {
    _ropePlayer.dispose();
    _fxPlayer.dispose();
  }
}
