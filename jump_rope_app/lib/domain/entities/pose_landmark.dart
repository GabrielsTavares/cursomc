import 'package:equatable/equatable.dart';

enum PoseLandmarkType {
  nose,
  leftShoulder,
  rightShoulder,
  leftElbow,
  rightElbow,
  leftWrist,
  rightWrist,
  leftHip,
  rightHip,
  leftKnee,
  rightKnee,
  leftAnkle,
  rightAnkle,
}

class PoseLandmark extends Equatable {
  const PoseLandmark({
    required this.type,
    required this.x,
    required this.y,
    required this.z,
    required this.likelihood,
  });

  final PoseLandmarkType type;
  final double x;
  final double y;
  final double z;
  final double likelihood;

  bool get isVisible => likelihood >= 0.5;

  @override
  List<Object?> get props => [type, x, y, z, likelihood];
}

class PoseFrame extends Equatable {
  const PoseFrame({
    required this.landmarks,
    required this.timestamp,
    required this.imageWidth,
    required this.imageHeight,
  });

  final List<PoseLandmark> landmarks;
  final DateTime timestamp;
  final int imageWidth;
  final int imageHeight;

  PoseLandmark? landmark(PoseLandmarkType type) {
    for (final item in landmarks) {
      if (item.type == type) {
        return item;
      }
    }
    return null;
  }

  @override
  List<Object?> get props => [landmarks, timestamp, imageWidth, imageHeight];
}
