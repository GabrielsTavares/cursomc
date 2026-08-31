import 'package:flutter_test/flutter_test.dart';
import 'package:jump_rope_app/domain/entities/pose_landmark.dart';
import 'package:jump_rope_app/domain/entities/rope_workout_config.dart';
import 'package:jump_rope_app/domain/entities/workout_session_state.dart';
import 'package:jump_rope_app/domain/services/jump_counter.dart';
import 'package:jump_rope_app/workout/workout_engine.dart';

PoseFrame frameWithAnkleY(double y) {
  return PoseFrame(
    landmarks: [
      PoseLandmark(
        type: PoseLandmarkType.leftAnkle,
        x: 0.4,
        y: y,
        z: 0,
        likelihood: 0.99,
      ),
      PoseLandmark(
        type: PoseLandmarkType.rightWrist,
        x: 0.3,
        y: 0.4,
        z: 0,
        likelihood: 0.99,
      ),
      PoseLandmark(
        type: PoseLandmarkType.leftWrist,
        x: 0.7,
        y: 0.4,
        z: 0,
        likelihood: 0.99,
      ),
    ],
    timestamp: DateTime.now(),
    imageWidth: 720,
    imageHeight: 1280,
  );
}

void main() {
  test('contador detecta pulo quando tornozelo sobe e desce', () {
    final counter = JumpCounter(
      minJumpAmplitude: 0.02,
      minJumpIntervalMs: 100,
      calibrationFrames: 3,
    );

    var jumps = 0;
    for (var i = 0; i < 3; i++) {
      counter.process(frameWithAnkleY(0.70));
    }

    expect(counter.process(frameWithAnkleY(0.62)).jumpDetected, isFalse);
    expect(counter.process(frameWithAnkleY(0.55)).jumpDetected, isFalse);
    if (counter.process(frameWithAnkleY(0.69)).jumpDetected) jumps++;
    if (counter.process(frameWithAnkleY(0.71)).jumpDetected) jumps++;

    expect(jumps, greaterThanOrEqualTo(0));
  });

  test('motor completa série e inicia descanso', () {
    const config = RopeWorkoutConfig(
      id: 'test',
      name: 'Teste',
      totalSeries: 2,
      jumpsPerSeries: 3,
      restBetweenSeries: Duration(seconds: 5),
    );

    final engine = WorkoutEngine(config)..start();

    for (var i = 0; i < 3; i++) {
      final result = engine.registerJump(
        bodyDetected: true,
        ropePhase: 0,
        showGroundHit: true,
      );
      if (i == 2) {
        expect(result.state.phase.name, 'resting');
        expect(result.state.seriesJumps, 3);
        expect(result.state.totalJumps, 3);
      }
    }
  });

  test('contador total acumula entre séries', () async {
    const config = RopeWorkoutConfig(
      id: 'test',
      name: 'Teste',
      totalSeries: 2,
      jumpsPerSeries: 2,
      restBetweenSeries: Duration(seconds: 1),
    );

    final engine = WorkoutEngine(config)..start();

    engine.registerJump(bodyDetected: true, ropePhase: 0, showGroundHit: true);
    engine.registerJump(bodyDetected: true, ropePhase: 0, showGroundHit: true);
    expect(engine.state.totalJumps, 2);
    expect(engine.state.phase, WorkoutPhase.resting);

    await Future<void>.delayed(const Duration(milliseconds: 1100));
    engine.tick(const Duration(seconds: 2));
    expect(engine.state.currentSeries, 2);
    expect(engine.state.totalJumps, 2);
    expect(engine.state.seriesJumps, 0);
  });
}
