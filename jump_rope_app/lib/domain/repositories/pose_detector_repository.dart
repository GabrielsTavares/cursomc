import '../../domain/entities/pose_landmark.dart';

abstract class PoseDetectorRepository {
  Stream<PoseFrame> get poseFrames;
  Future<void> start();
  Future<void> stop();
  void dispose();
}
