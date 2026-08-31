import 'dart:math' as math;

import 'package:flutter/material.dart';

class VirtualRopePainter extends CustomPainter {
  VirtualRopePainter({
    required this.leftWrist,
    required this.rightWrist,
    required this.ropePhase,
    required this.showGroundHit,
    required this.groundY,
    this.ropeColor = const Color(0xFF39FF14),
  });

  final Offset? leftWrist;
  final Offset? rightWrist;
  final double ropePhase;
  final bool showGroundHit;
  final double? groundY;
  final Color ropeColor;

  @override
  void paint(Canvas canvas, Size size) {
    final left = _mirror(leftWrist, size);
    final right = _mirror(rightWrist, size);
    if (left == null || right == null) return;

    final ground = groundY != null ? groundY! * size.height : size.height * 0.88;
    final centerX = (left.dx + right.dx) / 2;
    final handY = (left.dy + right.dy) / 2;
    final span = (right.dx - left.dx).abs().clamp(40.0, size.width * 0.8);
    final amplitude = (ground - handY).clamp(80.0, size.height * 0.55);

    final phaseAngle = ropePhase * 2 * math.pi;
    final sag = math.sin(phaseAngle) * amplitude;
    final controlY = handY + amplitude * 0.35 + sag;

    final path = Path()
      ..moveTo(left.dx, left.dy)
      ..quadraticBezierTo(centerX, controlY, right.dx, right.dy);

    final glowPaint = Paint()
      ..color = ropeColor.withOpacity(0.35)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 14
      ..strokeCap = StrokeCap.round
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8);

    final ropePaint = Paint()
      ..color = ropeColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 6
      ..strokeCap = StrokeCap.round;

    canvas.drawPath(path, glowPaint);
    canvas.drawPath(path, ropePaint);

    final handlePaint = Paint()..color = ropeColor.withOpacity(0.9);
    canvas.drawCircle(left, 10, handlePaint);
    canvas.drawCircle(right, 10, handlePaint);

    if (showGroundHit || ropePhase < 0.12 || ropePhase > 0.88) {
      _drawGroundHit(canvas, Offset(centerX, ground), span);
    }
  }

  void _drawGroundHit(Canvas canvas, Offset point, double span) {
    final sparkPaint = Paint()
      ..color = const Color(0xFF39FF14).withOpacity(0.75)
      ..strokeWidth = 3
      ..style = PaintingStyle.stroke;

    for (var i = 0; i < 5; i++) {
      final angle = -math.pi + (i / 4) * math.pi;
      final end = Offset(
        point.dx + math.cos(angle) * span * 0.15,
        point.dy + math.sin(angle) * 8,
      );
      canvas.drawLine(point, end, sparkPaint);
    }

    final dustPaint = Paint()
      ..color = Colors.white.withOpacity(0.35)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6);
    canvas.drawOval(
      Rect.fromCenter(center: point, width: span * 0.35, height: 14),
      dustPaint,
    );
  }

  Offset? _mirror(Offset? point, Size size) {
    if (point == null) return null;
    return Offset((1 - point.dx) * size.width, point.dy * size.height);
  }

  @override
  bool shouldRepaint(covariant VirtualRopePainter oldDelegate) {
    return oldDelegate.leftWrist != leftWrist ||
        oldDelegate.rightWrist != rightWrist ||
        oldDelegate.ropePhase != ropePhase ||
        oldDelegate.showGroundHit != showGroundHit ||
        oldDelegate.groundY != groundY;
  }
}
