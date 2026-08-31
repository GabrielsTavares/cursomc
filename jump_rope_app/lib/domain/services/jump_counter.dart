import '../entities/pose_landmark.dart';

enum JumpCounterState { idle, rising, falling }

class JumpCounterResult {
  const JumpCounterResult({
    required this.jumpDetected,
    required this.bodyDetected,
    required this.ropePhase,
    required this.groundHit,
    required this.leftWrist,
    required this.rightWrist,
    required this.groundY,
  });

  final bool jumpDetected;
  final bool bodyDetected;
  final double ropePhase;
  final bool groundHit;
  final PoseLandmark? leftWrist;
  final PoseLandmark? rightWrist;
  final double? groundY;
}

/// Detecta pulos a partir de landmarks de tornozelos/quadril.
class JumpCounter {
  JumpCounter({
    this.minJumpAmplitude = 0.025,
    this.minJumpIntervalMs = 280,
    this.calibrationFrames = 20,
  });

  final double minJumpAmplitude;
  final int minJumpIntervalMs;
  final int calibrationFrames;

  double? _baselineY;
  int _calibrationCount = 0;
  JumpCounterState _state = JumpCounterState.idle;
  DateTime? _lastJumpAt;
  double _ropePhase = 0;
  bool _groundHitPending = false;
  double _lastAnkleY = 0;

  void reset() {
    _baselineY = null;
    _calibrationCount = 0;
    _state = JumpCounterState.idle;
    _lastJumpAt = null;
    _ropePhase = 0;
    _groundHitPending = false;
  }

  JumpCounterResult process(PoseFrame frame) {
    final leftAnkle = frame.landmark(PoseLandmarkType.leftAnkle);
    final rightAnkle = frame.landmark(PoseLandmarkType.rightAnkle);
    final leftWrist = frame.landmark(PoseLandmarkType.leftWrist);
    final rightWrist = frame.landmark(PoseLandmarkType.rightWrist);
    final leftHip = frame.landmark(PoseLandmarkType.leftHip);
    final rightHip = frame.landmark(PoseLandmarkType.rightHip);

    final ankles = [leftAnkle, rightAnkle].whereType<PoseLandmark>().where((l) => l.isVisible).toList();
    final hips = [leftHip, rightHip].whereType<PoseLandmark>().where((l) => l.isVisible).toList();

    if (ankles.isEmpty && hips.isEmpty) {
      return JumpCounterResult(
        jumpDetected: false,
        bodyDetected: false,
        ropePhase: _ropePhase,
        groundHit: false,
        leftWrist: leftWrist,
        rightWrist: rightWrist,
        groundY: _baselineY,
      );
    }

    final currentY = ankles.isNotEmpty
        ? ankles.map((a) => a.y).reduce((a, b) => a > b ? a : b)
        : hips.map((h) => h.y).reduce((a, b) => a > b ? a : b);

    if (_baselineY == null || _calibrationCount < calibrationFrames) {
      _baselineY = _baselineY == null ? currentY : (_baselineY! * _calibrationCount + currentY) / (_calibrationCount + 1);
      _calibrationCount++;
      _lastAnkleY = currentY;
      return JumpCounterResult(
        jumpDetected: false,
        bodyDetected: true,
        ropePhase: _ropePhase,
        groundHit: false,
        leftWrist: leftWrist,
        rightWrist: rightWrist,
        groundY: _baselineY,
      );
    }

    final delta = _baselineY! - currentY;
    var jumpDetected = false;
    var groundHit = false;

    switch (_state) {
      case JumpCounterState.idle:
        if (delta > minJumpAmplitude * 0.5) {
          _state = JumpCounterState.rising;
        }
      case JumpCounterState.rising:
        if (delta >= minJumpAmplitude) {
          _state = JumpCounterState.falling;
        } else if (currentY >= _lastAnkleY) {
          _state = JumpCounterState.idle;
        }
      case JumpCounterState.falling:
        if (currentY >= _baselineY! - minJumpAmplitude * 0.15) {
          final now = frame.timestamp;
          final canCount = _lastJumpAt == null ||
              now.difference(_lastJumpAt!).inMilliseconds >= minJumpIntervalMs;
          if (canCount) {
            jumpDetected = true;
            groundHit = true;
            _lastJumpAt = now;
            _advanceRopePhase();
          }
          _state = JumpCounterState.idle;
        }
    }

    _lastAnkleY = currentY;
    _updateRopePhase(frame.timestamp, jumpDetected);

    if (groundHit) {
      _groundHitPending = true;
    } else if (_groundHitPending && _ropePhase > 0.2 && _ropePhase < 0.8) {
      _groundHitPending = false;
    }

    return JumpCounterResult(
      jumpDetected: jumpDetected,
      bodyDetected: true,
      ropePhase: _ropePhase,
      groundHit: groundHit,
      leftWrist: leftWrist,
      rightWrist: rightWrist,
      groundY: _baselineY,
    );
  }

  void _advanceRopePhase() {
    _ropePhase = 0;
  }

  void _updateRopePhase(DateTime timestamp, bool jumpDetected) {
    if (jumpDetected) {
      _ropePhase = 0;
      return;
    }
    // Animação contínua entre pulos (~2.5 rotações/s típico)
    _ropePhase = (_ropePhase + 0.08) % 1.0;
  }
}
