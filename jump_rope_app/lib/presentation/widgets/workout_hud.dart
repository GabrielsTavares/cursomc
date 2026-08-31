import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

import '../../domain/entities/workout_session_state.dart';
import 'virtual_rope_painter.dart';

class WorkoutHud extends StatelessWidget {
  const WorkoutHud({
    super.key,
    required this.session,
    this.statusMessage,
  });

  final WorkoutSessionState session;
  final String? statusMessage;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _SeriesHeader(session: session),
            if (statusMessage != null) ...[
              const SizedBox(height: 8),
              Text(
                statusMessage!,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white.withOpacity(0.85),
                  fontSize: 14,
                ),
              ),
            ],
            const Spacer(),
            if (session.phase == WorkoutPhase.resting)
              _RestPanel(session: session)
            else
              _JumpPanel(session: session),
          ],
        ),
      ),
    );
  }
}

class _SeriesHeader extends StatelessWidget {
  const _SeriesHeader({required this.session});

  final WorkoutSessionState session;

  @override
  Widget build(BuildContext context) {
    final progress = session.totalSeries == 0
        ? 0.0
        : (session.currentSeries - 1 + session.seriesJumps / session.seriesTarget.clamp(1, 999999)) /
            session.totalSeries;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Série ${session.currentSeries} de ${session.totalSeries}',
          style: const TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: LinearProgressIndicator(
            value: progress.clamp(0, 1),
            minHeight: 8,
            backgroundColor: Colors.white12,
            color: const Color(0xFF39FF14),
          ),
        ),
      ],
    );
  }
}

class _JumpPanel extends StatelessWidget {
  const _JumpPanel({required this.session});

  final WorkoutSessionState session;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.55),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFF39FF14).withOpacity(0.35)),
      ),
      child: Column(
        children: [
          Text(
            '${session.seriesJumps}',
            style: const TextStyle(
              color: Color(0xFF39FF14),
              fontSize: 64,
              fontWeight: FontWeight.bold,
              height: 1,
            ),
          ),
          Text(
            '/ ${session.seriesTarget} pulos',
            style: TextStyle(color: Colors.white.withOpacity(0.85), fontSize: 18),
          ),
          const SizedBox(height: 12),
          Text(
            'Total: ${session.totalJumps}',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 22,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _RestPanel extends StatelessWidget {
  const _RestPanel({required this.session});

  final WorkoutSessionState session;

  @override
  Widget build(BuildContext context) {
    final seconds = session.restRemaining.inSeconds.clamp(0, 9999);

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.65),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.lightBlueAccent.withOpacity(0.45)),
      ),
      child: Column(
        children: [
          const Text(
            'DESCANSO',
            style: TextStyle(
              color: Colors.lightBlueAccent,
              fontSize: 16,
              letterSpacing: 2,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            '$seconds',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 72,
              fontWeight: FontWeight.bold,
              height: 1,
            ),
          ),
          const Text('segundos', style: TextStyle(color: Colors.white70)),
          const SizedBox(height: 12),
          Text(
            'Próximo: série ${session.currentSeries + 1} — ${session.seriesTarget} pulos',
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white70),
          ),
          const SizedBox(height: 8),
          Text(
            'Total acumulado: ${session.totalJumps} pulos',
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class CameraWorkoutView extends StatelessWidget {
  const CameraWorkoutView({
    super.key,
    required this.controller,
    required this.session,
    this.leftWrist,
    this.rightWrist,
    this.groundY,
    this.statusMessage,
  });

  final CameraController controller;
  final WorkoutSessionState session;
  final ({double x, double y})? leftWrist;
  final ({double x, double y})? rightWrist;
  final double? groundY;
  final String? statusMessage;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        _CameraPreview(controller: controller),
        CustomPaint(
          painter: VirtualRopePainter(
            leftWrist: leftWrist != null ? Offset(leftWrist!.x, leftWrist!.y) : null,
            rightWrist: rightWrist != null ? Offset(rightWrist!.x, rightWrist!.y) : null,
            ropePhase: session.ropePhase,
            showGroundHit: session.showGroundHit,
            groundY: groundY,
          ),
        ),
        WorkoutHud(session: session, statusMessage: statusMessage),
      ],
    );
  }
}

class _CameraPreview extends StatelessWidget {
  const _CameraPreview({required this.controller});

  final CameraController controller;

  @override
  Widget build(BuildContext context) {
    if (!controller.value.isInitialized) {
      return const ColoredBox(
        color: Colors.black,
        child: Center(child: CircularProgressIndicator(color: Color(0xFF39FF14))),
      );
    }

    return FittedBox(
      fit: BoxFit.cover,
      child: SizedBox(
        width: controller.value.previewSize?.height ?? 1,
        height: controller.value.previewSize?.width ?? 1,
        child: CameraPreview(controller),
      ),
    );
  }
}
